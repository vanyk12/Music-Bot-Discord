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
import playdl, { SoundCloudTrack } from "play-dl";
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

async function getDirectUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, [
      "-f", "bestaudio/best",
      "--get-url",
      "--no-playlist",
      "--no-warnings",
      url,
    ]);
    let output = "";
    let errOutput = "";
    proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { errOutput += d.toString(); });
    proc.on("close", (code) => {
      const directUrl = output.trim().split("\n")[0];
      if (code !== 0 || !directUrl) {
        logger.error({ code, errOutput: errOutput.slice(0, 300), url }, "yt-dlp --get-url failed");
        reject(new Error(`yt-dlp failed (${code}): ${errOutput.slice(0, 200)}`));
      } else {
        logger.info({ directUrl: directUrl.slice(0, 80) }, "Got direct stream URL");
        resolve(directUrl);
      }
    });
    proc.on("error", (err) => reject(err));
  });
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

export async function searchSoundCloudMultiple(query: string, limit = 5): Promise<{ title: string; url: string; duration: string; thumbnail?: string }[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const results = await playdl.search(query, { source: { soundcloud: "tracks" }, limit });
    return results.map((r) => ({
      title: r.name,
      url: r.url,
      duration: formatDuration(r.durationInSec ?? 0),
      thumbnail: typeof r.thumbnail === "string" ? r.thumbnail : undefined,
    }));
  } catch (err) {
    logger.warn({ err }, "play-dl SoundCloud search failed");
    return [];
  }
}

export async function searchSoundCloud(query: string): Promise<{ title: string; url: string; duration: string; thumbnail?: string } | null> {
  try {
    const isUrl = query.startsWith("http://") || query.startsWith("https://");
    if (isUrl) {
      const info = await playdl.soundcloud(query);
      if (info.type !== "track") return null;
      const track = info as SoundCloudTrack;
      return {
        title: track.name,
        url: track.url,
        duration: formatDuration(track.durationInSec ?? 0),
        thumbnail: typeof track.thumbnail === "string" ? track.thumbnail : undefined,
      };
    }
    const results = await playdl.search(query, { source: { soundcloud: "tracks" }, limit: 1 });
    if (!results.length) return null;
    const r = results[0]!;
    return {
      title: r.name,
      url: r.url,
      duration: formatDuration(r.durationInSec ?? 0),
      thumbnail: typeof r.thumbnail === "string" ? r.thumbnail : undefined,
    };
  } catch (err) {
    logger.error({ err, query }, "play-dl search error");
    return null;
  }
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

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

export class GuildPlayer {
  public readonly guildId: string;
  public queue: MusicQueue;
  public connection: VoiceConnection | null = null;
  public audioPlayer: AudioPlayer;
  public volume = 100;
  public paused = false;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;

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
        this.startInactivityTimer();
      }
    });

    this.audioPlayer.on("error", (err) => {
      logger.error({ err }, "AudioPlayer error");
      this.startInactivityTimer();
    });
  }

  private startInactivityTimer() {
    this.clearInactivityTimer();
    this.inactivityTimer = setTimeout(() => {
      if (!this.queue.currentTrack && this.queue.isEmpty()) {
        logger.info({ guildId: this.guildId }, "Inactivity timeout — leaving voice channel");
        this.stop();
      }
    }, INACTIVITY_TIMEOUT_MS);
    logger.info({ guildId: this.guildId }, "Inactivity timer started (5 min)");
  }

  private clearInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  setConnection(connection: VoiceConnection) {
    this.connection = connection;
    connection.subscribe(this.audioPlayer);
  }

  async playTrack(track: Track): Promise<void> {
    this.clearInactivityTimer();
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
    this.clearInactivityTimer();
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
    this.clearInactivityTimer();
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
