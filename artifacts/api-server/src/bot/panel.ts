import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { GuildPlayer } from "./player.js";
import { logger } from "../lib/logger.js";

type SendableChannel = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send: (options: any) => Promise<Message>;
};

export const PANEL_ID_PREFIX = "music_";

export function buildPanelEmbed(player: GuildPlayer): EmbedBuilder {
  const track = player.queue.currentTrack;
  const queueSize = player.queue.size();

  const embed = new EmbedBuilder().setTitle("🎵 Музыкальный плеер");

  if (track) {
    embed
      .setColor(0xff5500)
      .setDescription(`**[${track.title}](${track.url})**`)
      .addFields(
        { name: "⏱ Длительность", value: track.duration, inline: true },
        { name: "🔊 Громкость", value: `${player.volume}%`, inline: true },
        { name: "📋 В очереди", value: `${queueSize} трек(ов)`, inline: true },
        { name: "👤 Запросил", value: track.requestedBy, inline: true },
        { name: "📻 Статус", value: player.paused ? "⏸ Пауза" : "▶️ Играет", inline: true },
      );
    if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  } else {
    embed
      .setColor(0x555555)
      .setDescription("Нет активных треков.\nИспользуй `/play` чтобы начать воспроизведение!");
  }

  embed.setFooter({ text: "Используй кнопки ниже для управления плеером" });
  return embed;
}

export function buildPanelRows(player: GuildPlayer): ActionRowBuilder<ButtonBuilder>[] {
  const paused = player.paused;
  const hasTrack = !!player.queue.currentTrack;

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`music_pause_${player.guildId}`)
      .setLabel(paused ? "▶️ Продолжить" : "⏸️ Пауза")
      .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!hasTrack),
    new ButtonBuilder()
      .setCustomId(`music_skip_${player.guildId}`)
      .setLabel("⏭️ Пропустить")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasTrack),
    new ButtonBuilder()
      .setCustomId(`music_stop_${player.guildId}`)
      .setLabel("⏹️ Стоп")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasTrack),
  );

  const newVolDown = Math.max(0, player.volume - 10);
  const newVolUp = Math.min(200, player.volume + 10);

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`music_voldown_${player.guildId}`)
      .setLabel(`🔉 Тише (${newVolDown}%)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(player.volume <= 0),
    new ButtonBuilder()
      .setCustomId(`music_volup_${player.guildId}`)
      .setLabel(`🔊 Громче (${newVolUp}%)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(player.volume >= 200),
  );

  return [row1, row2];
}

const panelMessages = new Map<string, Message>();

export async function sendPanel(channel: SendableChannel, player: GuildPlayer): Promise<void> {
  await deletePanel(player.guildId);

  try {
    const msg = await channel.send({
      embeds: [buildPanelEmbed(player)],
      components: buildPanelRows(player),
    });
    panelMessages.set(player.guildId, msg);

    player.onPanelUpdate = () => refreshPanel(player);
    player.onPanelDelete = () => deletePanel(player.guildId);
  } catch (err) {
    logger.warn({ err }, "Failed to send music panel");
  }
}

export async function refreshPanel(player: GuildPlayer): Promise<void> {
  const msg = panelMessages.get(player.guildId);
  if (!msg) return;
  try {
    await msg.edit({
      embeds: [buildPanelEmbed(player)],
      components: buildPanelRows(player),
    });
  } catch (err) {
    logger.warn({ err }, "Failed to refresh music panel — removing reference");
    panelMessages.delete(player.guildId);
    player.onPanelUpdate = null;
    player.onPanelDelete = null;
  }
}

export async function deletePanel(guildId: string): Promise<void> {
  const msg = panelMessages.get(guildId);
  panelMessages.delete(guildId);
  if (!msg) return;
  try {
    await msg.delete();
  } catch {
  }
}
