/**
 * Standardized topics for hackathons
 * This file provides a single source of truth for all topics used across the application
 */

export const HACKATHON_TOPICS = [
  "AI",
  "Crypto",
  "Web3",
  "Fintech",
  "Healthcare",
  "Sustainability",
  "Gaming",
  "Defense",
  "IoT",
  "Education",
] as const;

export type HackathonTopic = (typeof HACKATHON_TOPICS)[number];

// Topic display configurations for the frontend
export const TOPIC_DISPLAY_CONFIG: Record<
  HackathonTopic,
  {
    label: string;
    color: string;
    description: string;
  }
> = {
  // `color` cycles through the theme-aware `.topic-badge-1`..`.topic-badge-5`
  // utility classes (see `app/globals.css`) instead of hardcoded Tailwind
  // grays - each class maps to that theme preset's own --chart-N token, so
  // topic tags stay distinct-but-harmonious and correctly themed (light,
  // dark, and every preset) without a hand-maintained hex palette.
  AI: {
    label: "AI & ML",
    color: "topic-badge-1",
    description: "Artificial Intelligence and Machine Learning",
  },
  Crypto: {
    label: "Crypto",
    color: "topic-badge-2",
    description: "Cryptocurrency and Blockchain",
  },
  Web3: {
    label: "Web3",
    color: "topic-badge-3",
    description: "Decentralized Web Technologies",
  },
  Fintech: {
    label: "Fintech",
    color: "topic-badge-4",
    description: "Financial Technology",
  },
  Healthcare: {
    label: "Healthcare",
    color: "topic-badge-5",
    description: "Medical and Health Technology",
  },
  Sustainability: {
    label: "Climate",
    color: "topic-badge-1",
    description: "Climate and Sustainability",
  },
  Gaming: {
    label: "Gaming",
    color: "topic-badge-2",
    description: "Game Development and Metaverse",
  },
  Defense: {
    label: "Defense",
    color: "topic-badge-3",
    description: "Defense and Security",
  },
  IoT: {
    label: "IoT",
    color: "topic-badge-4",
    description: "Internet of Things and Hardware",
  },
  Education: {
    label: "Education",
    color: "topic-badge-5",
    description: "Educational Technology",
  },
};

/**
 * Get display configuration for a topic
 */
export function getTopicDisplay(topic: string) {
  return (
    TOPIC_DISPLAY_CONFIG[topic as HackathonTopic] || {
      label: topic,
      color: "bg-muted text-muted-foreground border-transparent",
      description: topic,
    }
  );
}

/**
 * Check if a topic is valid
 */
export function isValidTopic(topic: string): topic is HackathonTopic {
  return HACKATHON_TOPICS.includes(topic as HackathonTopic);
}
