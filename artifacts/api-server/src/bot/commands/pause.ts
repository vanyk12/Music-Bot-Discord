import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getPlayer } from "../manager.js";

export const data = new SlashCommandBuilder()
  .setName("pause")
  .setDescription("Поставить музыку на паузу");

export async function execute(interaction: ChatInputCommandInteraction) {
  const player = getPlayer(interaction.guildId!);
  if (!player) return interaction.reply("❌ Сейчас ничего не играет.");

  if (player.pause()) {
    return interaction.reply("⏸️ Пауза.");
  }
  return interaction.reply("❌ Невозможно поставить на паузу сейчас.");
}
