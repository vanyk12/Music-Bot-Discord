import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getPlayer } from "../manager.js";

export const data = new SlashCommandBuilder()
  .setName("skip")
  .setDescription("Пропустить текущий трек");

export async function execute(interaction: ChatInputCommandInteraction) {
  const player = getPlayer(interaction.guildId!);
  if (!player || !player.queue.currentTrack) {
    return interaction.reply("❌ Сейчас ничего не играет.");
  }

  player.skip();
  return interaction.reply("⏭️ Трек пропущен.");
}
