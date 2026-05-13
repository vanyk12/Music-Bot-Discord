import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getPlayer } from "../manager.js";

export const data = new SlashCommandBuilder()
  .setName("volume")
  .setDescription("Установить громкость (0–200)")
  .addIntegerOption((opt) =>
    opt
      .setName("level")
      .setDescription("Уровень громкости от 0 до 200 (по умолчанию 80)")
      .setMinValue(0)
      .setMaxValue(200)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const player = getPlayer(interaction.guildId!);
  if (!player) return interaction.reply("❌ Сейчас ничего не играет.");

  const level = interaction.options.getInteger("level", true);
  if (player.setVolume(level)) {
    return interaction.reply(`🔊 Громкость установлена на **${level}%**.`);
  }
  return interaction.reply("❌ Недопустимое значение громкости.");
}
