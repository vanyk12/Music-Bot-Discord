import {
  AudioPlayer,
  AudioPlayerStatus,
  VoiceConnection,
  createAudioPlayer,
  createAudioResource,
  entersState,
  NoSubscriberBehavior,
  StreamType,
} from "@discordjs/voice";

import { spawn, execFileSync } from "node:child_process";
import { MusicQueue, Track } from "./queue.js";
import { logger } from "../lib/logger.js";

function resolveYtdlp(): string {
  if (process.env["YTDLP_PATH"]) return process.env["YTDLP_PATH"];
  const candidates = [
    "/nix/store/xighyx5xgdy7w1bmnrgldkxij0gyjq1x-yt-dlp-2025.6.30/bin/yt-dlp",
    "/root/.local/bin/yt-dlp",
    "/home/app/.local/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    "yt-dlp",
  ];
  for (const p of candidates) {
    try {
      execFileSync(p, ["--version"], { stdio: "ignore" });
      logger.info({ path: p }, "Found yt-dlp");
      return p;
    } catch { /* try next */ }
  }
  logger.warn("yt-dlp not found in any known path, falling back to 'yt-dlp'");
  return "yt-dlp";
}

const YTDLP_PATH = resolveYtdlp();
const FFMPEG_PATH = process.env["FFMPEG_PATH"] ?? "ffmpeg";

async function tryGetUrl(url: string, playerClient: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, [
      "-f", "bestaudio/best",
      "--get-url",
      "--no-playlist",
      "--no-warnings",
      "--extractor-args", `youtube:player_client=${playerClient}`,
      url,
    ]);
    let output = "";
    let errOutput = "";
    proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { errOutput += d.toString(); });
    proc.on("close", (code) => {
      const directUrl = output.trim().split("\n")[0];
      if (code !== 0 || !directUrl) {
        reject(new Error(`client=${playerClient} failed (${code}): ${errOutput.slice(0, 150)}`));
      } else {
        resolve(directUrl);
      }
    });
    proc.on("error", (err) => reject(err));
  });
}

async function getDirectUrl(url: string): Promise<string> {
  const clients = ["ios", "android", "web"];
  let lastError = "";
  for (const client of clients) {
    try {
      const directUrl = await tryGetUrl(url, client);
      logger.info({ client, directUrl: directUrl.slice(0, 80) }, "Got direct stream URL");
      return directUrl;
    } catch (err) {
      lastError = String(err);
      logger.warn({ client, err: lastError.slice(0, 150) }, "Client failed, trying next");
    }
  }
  logger.error({ url, lastError }, "All yt-dlp clients failed");
  throw new Error(`All clients failed: ${lastError}`);
}

function createFfmpegStream(directUrl: string) {
  const ffmpeg = spawn(FFMPEG_PATH, [
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-headers", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "-i", directUrl,
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "-vn",
    "pipe:1",
  ]);

  ffmpeg.on("error", (err) => logger.error({ err }, "ffmpeg spawn error"));
  ffmpeg.stderr.on("data", (d: Buffer) => {
    const msg = d.toString().trim();
    if (msg && !msg.includes("Press [q]")) logger.debug({ msg }, "ffmpeg stderr");
  });
  ffmpeg.on("close", (code) => {
    if (code !== 0 && code !== null) logger.error({ code }, "ffmpeg exited with error");
  });

  return ffmpeg.stdout;
}

export async function searchYoutube(query: string): Promise<{ title: string; url: string; duration: string; thumbnail?: string } | null> {
  return new Promise((resolve) => {
    const isUrl = query.startsWith("http://") || query.startsWith("https://");
    const searchQuery = isUrl ? query : `ytsearch1:${query}`;

    const proc = spawn(YTDLP_PATH, [
      "--flat-playlist",
      "--dump-json",
      "--no-warnings",
      "--extractor-args", "youtube:player_client=ios",
      searchQuery,
    ]);

    let output = "";
    let errOutput = "";
    proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { errOutput += d.toString(); });

    proc.on("close", (code) => {
      if (!output.trim()) {
        logger.warn({ code, errOutput, query }, "yt-dlp returned no output");
        resolve(null);
        return;
      }
      try {
        const firstLine = output.trim().split("\n")[0]!;
        const info = JSON.parse(firstLine) as {
          title?: string;
          webpage_url?: string;
          url?: string;
          duration?: number;
          thumbnail?: string;
        };
        resolve({
          title: info.title ?? "Неизвестно",
          url: info.webpage_url ?? info.url ?? searchQuery,
          duration: formatDuration(info.duration ?? 0),
          thumbnail: info.thumbnail,
        });
      } catch {
        logger.warn({ output: output.slice(0, 200), query }, "Failed to parse yt-dlp JSON");
        resolve(null);
      }
    });

    proc.on("error", (err) => {
      logger.error({ err }, "yt-dlp spawn error in search");
      resolve(null);
    });
  });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export class GuildPlayer {
  public readonly guildId: string;
  public queue: MusicQueue;
  public connection: VoiceConnection | null = null;
  public audioPlayer: AudioPlayer;
  public volume = 100;
  public paused = false;

  constructor(guildId: string) {
    this.guildId = guildId;
    this.queue = new MusicQueue();
    this.audioPlayer = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      if (this.queue.loop && this.queue.currentTrack) {
        this.playTrack(this.queue.currentTrack).catch((err) =>
          logger.error({ err }, "Error replaying track"),
        );
        return;
      }

      const next = this.queue.dequeue();
      if (next) {
        this.queue.currentTrack = next;
        this.playTrack(next).catch((err) =>
          logger.error({ err }, "Error playing next track"),
        );
      } else {
        this.queue.currentTrack = null;
      }
    });

    this.audioPlayer.on("error", (err) => {
      logger.error({ err }, "AudioPlayer error");
    });
  }

  setConnection(connection: VoiceConnection) {
    this.connection = connection;
    connection.subscribe(this.audioPlayer);
  }

  async playTrack(track: Track): Promise<void> {
    const directUrl = await getDirectUrl(track.url);
    const stream = createFfmpegStream(directUrl);

    const resource = createAudioResource(stream, {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });

    resource.volume?.setVolumeLogarithmic(this.volume / 100);
    this.audioPlayer.play(resource);
    this.paused = false;

    await entersState(this.audioPlayer, AudioPlayerStatus.Playing, 15_000);
  }

  async start(): Promise<void> {
    const next = this.queue.dequeue();
    if (!next) return;
    this.queue.currentTrack = next;
    await this.playTrack(next);
  }

  pause(): boolean {
    if (this.audioPlayer.state.status === AudioPlayerStatus.Playing) {
      this.audioPlayer.pause();
      this.paused = true;
      return true;
    }
    return false;
  }

  resume(): boolean {
    if (this.audioPlayer.state.status === AudioPlayerStatus.Paused) {
      this.audioPlayer.unpause();
      this.paused = false;
      return true;
    }
    return false;
  }

  skip(): boolean {
    if (
      this.audioPlayer.state.status === AudioPlayerStatus.Playing ||
      this.audioPlayer.state.status === AudioPlayerStatus.Paused
    ) {
      this.audioPlayer.stop(true);
      return true;
    }
    return false;
  }

  stop(): void {
    this.queue.clear();
    this.queue.currentTrack = null;
    this.queue.loop = false;
    this.audioPlayer.stop(true);
    this.connection?.destroy();
    this.connection = null;
  }

  setVolume(vol: number): boolean {
    if (vol < 0 || vol > 200) return false;
    this.volume = vol;
    const state = this.audioPlayer.state;
    if (
      state.status === AudioPlayerStatus.Playing ||
      state.status === AudioPlayerStatus.Paused
    ) {
      const resource = (state as { resource?: { volume?: { setVolumeLogarithmic: (v: number) => void } } }).resource;
      resource?.volume?.setVolumeLogarithmic(vol / 100);
    }
    return true;
  }

  isPlaying(): boolean {
    return this.audioPlayer.state.status === AudioPlayerStatus.Playing;
  }
}
