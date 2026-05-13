import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "../manager.js";

export const data = new SlashCommandBuilder()
  .setName("nowplaying")
  .setDescription("Показать, что сейчас играет");

export async function execute(interaction: ChatInputCommandInteraction) {
  const player = getPlayer(interaction.guildId!);
  if (!player || !player.queue.currentTrack) {
    return interaction.reply("❌ Сейчас ничего не играет.");
  }

  const track = player.queue.currentTrack;
  const status = player.paused ? "⏸️ На паузе" : "▶️ Играет";

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(`${status}: ${track.title}`)
    .setURL(track.url)
    .addFields(
      { name: "Длительность", value: track.duration, inline: true },
      { name: "Запросил", value: track.requestedBy, inline: true },
      { name: "🔊 Громкость", value: `${player.volume}%`, inline: true },
      { name: "🔁 Повтор", value: player.queue.loop ? "Вкл" : "Выкл", inline: true },
    )
    .setThumbnail(track.thumbnail ?? null);

  return interaction.reply({ embeds: [embed] });
}
