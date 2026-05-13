import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getPlayer, removePlayer } from "../manager.js";

export const data = new SlashCommandBuilder()
  .setName("stop")
  .setDescription("Остановить воспроизведение и покинуть канал");

export async function execute(interaction: ChatInputCommandInteraction) {
  const player = getPlayer(interaction.guildId!);
  if (!player) return interaction.reply("❌ Бот не в голосовом канале.");

  player.stop();
  removePlayer(interaction.guildId!);
  return interaction.reply("⏹️ Воспроизведение остановлено, бот покинул канал.");
}
