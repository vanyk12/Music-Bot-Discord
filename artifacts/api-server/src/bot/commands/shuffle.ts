import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getPlayer } from "../manager.js";

export const data = new SlashCommandBuilder()
  .setName("shuffle")
  .setDescription("Перемешать очередь");

export async function execute(interaction: ChatInputCommandInteraction) {
  const player = getPlayer(interaction.guildId!);
  if (!player || player.queue.isEmpty()) {
    return interaction.reply("❌ Очередь пуста.");
  }

  player.queue.shuffle();
  return interaction.reply("🔀 Очередь перемешана.");
}
