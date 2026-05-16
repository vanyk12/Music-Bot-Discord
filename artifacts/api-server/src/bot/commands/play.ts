import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  GuildMember,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import { getOrCreatePlayer } from "../manager.js";
import { searchSoundCloud, searchSoundCloudMultiple } from "../player.js";
import { sendPanel } from "../panel.js";
import { logger } from "../../lib/logger.js";
import { Track } from "../queue.js";

export const data = new SlashCommandBuilder()
  .setName("play")
  .setDescription("Воспроизвести музыку с SoundCloud")
  .addStringOption((opt) =>
    opt
      .setName("query")
      .setDescription("Название песни или ссылка на SoundCloud")
      .setRequired(true)
      .setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused();
  if (!focused || focused.trim().length < 2) {
    await interaction.respond([]);
    return;
  }
  try {
    const isUrl = focused.startsWith("http://") || focused.startsWith("https://");
    if (isUrl) {
      const info = await searchSoundCloud(focused);
      if (info) {
        await interaction.respond([{
          name: `🎵 ${info.title} [${info.duration}]`.slice(0, 100),
          value: info.url,
        }]);
      } else {
        await interaction.respond([{
          name: focused.slice(0, 100),
          value: focused,
        }]);
      }
      return;
    }
    const results = await searchSoundCloudMultiple(focused, 10);
    await interaction.respond(
      results
        .filter((r) => r.url)
        .map((r) => ({
          name: `🎵 ${r.title} [${r.duration}]`.slice(0, 100),
          value: r.url,
        })),
    );
  } catch {
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    return interaction.editReply("❌ Сначала зайди в голосовой канал!");
  }

  const query = interaction.options.getString("query", true);
  const guildId = interaction.guildId!;
  const player = getOrCreatePlayer(guildId);

  const isUrl = query.startsWith("http://") || query.startsWith("https://");

  let track: Track;

  if (isUrl) {
    const info = await searchSoundCloud(query);
    const titleFallback = decodeURIComponent(query.split("/").pop() ?? "Трек").replace(/-/g, " ");
    track = {
      title: info?.title ?? titleFallback,
      url: query,
      duration: info?.duration ?? "0:00",
      requestedBy: interaction.user.username,
      thumbnail: info?.thumbnail,
    };
  } else {
    const info = await searchSoundCloud(query);
    if (!info) {
      return interaction.editReply("❌ Ничего не найдено на SoundCloud.");
    }
    track = {
      title: info.title,
      url: info.url,
      duration: info.duration,
      requestedBy: interaction.user.username,
      thumbnail: info.thumbnail,
    };
  }

  if (!player.connection || player.connection.state.status === VoiceConnectionStatus.Destroyed) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild!.voiceAdapterCreator,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
    } catch {
      connection.destroy();
      return interaction.editReply("❌ Не удалось подключиться к голосовому каналу.");
    }

    player.setConnection(connection);
  }

  const wasEmpty = player.queue.isEmpty() && !player.queue.currentTrack;
  player.queue.enqueue(track);

  if (wasEmpty) {
    try {
      await player.start();
    } catch (err) {
      player.queue.clear();
      player.queue.currentTrack = null;
      return interaction.editReply(`❌ Не удалось воспроизвести трек: **${track.title}**\nПопробуй другой трек или ссылку.`);
    }
    const ch = interaction.channel;
    if (ch && 'send' in ch) {
      sendPanel(ch as Parameters<typeof sendPanel>[0], player).catch((err) => {
        logger.error({ err }, "Failed to send panel from play command");
      });
    }
    const embed = new EmbedBuilder()
      .setColor(0xff5500)
      .setTitle("▶️ Сейчас играет")
      .setDescription(`**[${track.title}](${track.url})**`)
      .addFields(
        { name: "Длительность", value: track.duration, inline: true },
        { name: "Запросил", value: track.requestedBy, inline: true },
      )
      .setThumbnail(track.thumbnail ?? null);
    return interaction.editReply({ embeds: [embed] });
  } else {
    const pos = player.queue.size();
    const embed = new EmbedBuilder()
      .setColor(0xff5500)
      .setTitle("📋 Добавлено в очередь")
      .setDescription(`**[${track.title}](${track.url})**`)
      .addFields(
        { name: "Длительность", value: track.duration, inline: true },
        { name: "Позиция в очереди", value: String(pos), inline: true },
        { name: "Запросил", value: track.requestedBy, inline: true },
      )
      .setThumbnail(track.thumbnail ?? null);
    return interaction.editReply({ embeds: [embed] });
  }
}
