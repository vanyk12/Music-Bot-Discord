import {
  ChatInputCommandInteraction,
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
import { getSoundCloudPlaylist } from "../player.js";
import { sendPanel } from "../panel.js";

export const data = new SlashCommandBuilder()
  .setName("playlist")
  .setDescription("Воспроизвести плейлист с SoundCloud по ссылке")
  .addStringOption((opt) =>
    opt
      .setName("url")
      .setDescription("Ссылка на плейлист SoundCloud")
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    return interaction.editReply("❌ Сначала зайди в голосовой канал!");
  }

  const url = interaction.options.getString("url", true);

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return interaction.editReply("❌ Укажи ссылку на плейлист SoundCloud.");
  }

  const playlist = await getSoundCloudPlaylist(url);
  if (!playlist || playlist.tracks.length === 0) {
    return interaction.editReply("❌ Не удалось загрузить плейлист. Проверь что ссылка ведёт на публичный плейлист SoundCloud.");
  }

  const guildId = interaction.guildId!;
  const player = getOrCreatePlayer(guildId);

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

  for (const t of playlist.tracks) {
    player.queue.enqueue({
      title: t.title,
      url: t.url,
      duration: t.duration,
      requestedBy: interaction.user.username,
      thumbnail: t.thumbnail,
    });
  }

  if (wasEmpty) {
    try {
      await player.start();
    } catch {
      player.queue.clear();
      player.queue.currentTrack = null;
      return interaction.editReply(`❌ Не удалось воспроизвести первый трек плейлиста. Попробуй другой плейлист.`);
    }
    const ch = interaction.channel;
    if (ch && 'send' in ch) {
      sendPanel(ch as Parameters<typeof sendPanel>[0], player).catch(() => {});
    }
  }

  const firstTrack = player.queue.currentTrack;
  const embed = new EmbedBuilder()
    .setColor(0xff5500)
    .setTitle("📋 Плейлист добавлен в очередь")
    .setDescription(`**[${playlist.title}](${url})**`)
    .addFields(
      { name: "Треков", value: String(playlist.tracks.length), inline: true },
      { name: "Запросил", value: interaction.user.username, inline: true },
    );

  if (wasEmpty && firstTrack) {
    embed.addFields({ name: "▶️ Сейчас играет", value: `**${firstTrack.title}**`, inline: false });
  }

  return interaction.editReply({ embeds: [embed] });
}
