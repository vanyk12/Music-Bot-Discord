import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "../manager.js";

export const data = new SlashCommandBuilder()
  .setName("queue")
  .setDescription("Показать очередь воспроизведения");

export async function execute(interaction: ChatInputCommandInteraction) {
  const player = getPlayer(interaction.guildId!);
  if (!player || !player.queue.currentTrack) {
    return interaction.reply("❌ Очередь пуста.");
  }

  const current = player.queue.currentTrack;
  const tracks = player.queue.getAll();

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("🎵 Очередь воспроизведения");

  let desc = `**Сейчас играет:**\n▶️ [${current.title}](${current.url}) — \`${current.duration}\`\n`;

  if (tracks.length > 0) {
    desc += "\n**Далее:**\n";
    const shown = tracks.slice(0, 10);
    shown.forEach((t, i) => {
      desc += `\`${i + 1}.\` [${t.title}](${t.url}) — \`${t.duration}\`\n`;
    });
    if (tracks.length > 10) {
      desc += `\n...и ещё **${tracks.length - 10}** треков.`;
    }
  }

  desc += `\n🔁 Повтор: **${player.queue.loop ? "включён" : "выключен"}** | 🔊 Громкость: **${player.volume}%**`;

  embed.setDescription(desc);
  return interaction.reply({ embeds: [embed] });
}
