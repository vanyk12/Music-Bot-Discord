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
import { searchSoundCloud } from "../player.js";
import { Track } from "../queue.js";

export const data = new SlashCommandBuilder()
  .setName("play")
  .setDescription("Воспроизвести музыку с SoundCloud")
  .addStringOption((opt) =>
    opt
      .setName("query")
      .setDescription("Ссылка на SoundCloud или название песни")
      .setRequired(true),
  );

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

  const info = await searchSoundCloud(query);
  if (!info) {
    return interaction.editReply("❌ Ничего не найдено на SoundCloud.");
  }

  const track: Track = {
    title: info.title,
    url: info.url,
    duration: info.duration,
    requestedBy: interaction.user.username,
    thumbnail: info.thumbnail,
  };

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
    await player.start();
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
