import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getPlayer } from "../manager.js";

export const data = new SlashCommandBuilder()
  .setName("resume")
  .setDescription("Продолжить воспроизведение");

export async function execute(interaction: ChatInputCommandInteraction) {
  const player = getPlayer(interaction.guildId!);
  if (!player) return interaction.reply("❌ Сейчас ничего не играет.");

  if (player.resume()) {
    return interaction.reply("▶️ Воспроизведение возобновлено.");
  }
  return interaction.reply("❌ Музыка не на паузе.");
}
