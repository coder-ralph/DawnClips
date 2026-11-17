/**
 * Standard emoji for the comment composer. They are plain Unicode characters drawn by the device's own emoji font,
 * so there are no image files, no packages and no network requests.
 */
export const emojiGroups: ReadonlyArray<{ id: string; label: string; emojis: readonly string[] }> = [
  {
    id: "smileys",
    label: "Smileys",
    emojis: ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤩", "🥳", "😏", "😅", "😭", "😢", "😡", "😱", "🤔", "🙄", "😴", "🤯", "🥲", "😤", "🤗", "😇"],
  },
  {
    id: "gestures",
    label: "Gestures",
    emojis: ["👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "👀", "🫡", "🤞", "✌️", "🤙", "👌", "🫶", "🤌", "🖐️"],
  },
  {
    id: "hearts",
    label: "Hearts and symbols",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💯", "🔥", "✨", "⭐", "⚡", "💥", "🎉"],
  },
  {
    id: "gaming",
    label: "Gaming",
    emojis: ["🎮", "🏆", "🥇", "👑", "⚔️", "🛡️", "🗡️", "🏹", "💀", "☠️", "👻", "🐐", "🚀", "🎯", "🧠", "💎"],
  },
];

export const allEmojis = emojiGroups.flatMap((group) => group.emojis);
