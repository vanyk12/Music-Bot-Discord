import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getPlayer } from "../manager.js";

export const data = new SlashCommandBuilder()
  .setName("loop")
  .setDescription("Включить/выключить повтор текущего трека");

export async function execute(interaction: ChatInputCommandInteraction) {
  const player = getPlayer(interaction.guildId!);
  if (!player) return interaction.reply("❌ Сейчас ничего не играет.");

  player.queue.loop = !player.queue.loop;
  return interaction.reply(
    player.queue.loop ? "🔁 Повтор **включён**." : "➡️ Повтор **выключён**.",
  );
}
