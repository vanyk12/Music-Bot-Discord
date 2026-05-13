import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getPlayer } from "../manager.js";

export const data = new SlashCommandBuilder()
  .setName("remove")
  .setDescription("Удалить трек из очереди по номеру")
  .addIntegerOption((opt) =>
    opt
      .setName("position")
      .setDescription("Номер трека в очереди (начиная с 1)")
      .setMinValue(1)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const player = getPlayer(interaction.guildId!);
  if (!player || player.queue.isEmpty()) {
    return interaction.reply("❌ Очередь пуста.");
  }

  const pos = interaction.options.getInteger("position", true);
  const removed = player.queue.remove(pos - 1);

  if (!removed) {
    return interaction.reply(`❌ Трека с номером **${pos}** нет в очереди.`);
  }

  return interaction.reply(`🗑️ Удалён трек: **${removed.title}**`);
}
