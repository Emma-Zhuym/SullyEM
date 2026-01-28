


export enum AppID {
  Launcher = 'launcher',
  Settings = 'settings',
  Character = 'character',
  Chat = 'chat',
  GroupChat = 'group_chat', 
  Gallery = 'gallery',
  Music = 'music',
  Browser = 'browser',
  ThemeMaker = 'thememaker',
  Appearance = 'appearance',
  Date = 'date',
  User = 'user',
  Journal = 'journal',
  Schedule = 'schedule',
  Room = 'room',
  CheckPhone = 'check_phone',
  Social = 'social',
  Study = 'study',
  FAQ = 'faq',
  Game = 'game',
  Worldbook = 'worldbook', // New App
}

export interface SystemLog {
    id: string;
    timestamp: number;
    type: 'error' | 'network' | 'system';
    source: string;
    message: string;
    detail?: string;
}

export interface AppConfig {
  id: AppID;
  name: string;
  icon: string;
  color: string;
}

export interface OSTheme {
  hue: number;
  saturation: number;
  lightness: number;
  wallpaper: string;
  darkMode: boolean;
  contentColor?: string;
  launcherWidgetImage?: string; // New: Custom sticker/image for Launcher Page 2
  customFont?: string; // New: Custom global font (Base64)
}

export interface VirtualTime {
  hours: number;
  minutes: number;
  day: string;
}

export interface APIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ApiPreset {
  id: string;
  name: string;
  config: APIConfig;
}

export interface MemoryFragment {
  id: string;
  date: string;
  summary: string;
  mood?: string;
}

export interface SpriteConfig {
  scale: number;
  x: number;
  y: number;
}

export interface RoomItem {
    id: string;
    name: string;
    type: 'furniture' | 'decor';
    image: string;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    isInteractive: boolean;
    descriptionPrompt?: string;
}

export interface RoomTodo {
    id: string;
    charId: string;
    date: string;
    items: { text: string; done: boolean }[];
    generatedAt: number;
}

export interface RoomNote {
    id: string;
    charId: string;
    timestamp: number;
    content: string;
    type: 'lyric' | 'doodle' | 'thought' | 'search' | 'gossip';
    relatedMessageId?: number; 
}

export interface RoomGeneratedState {
    actorStatus: string;
    welcomeMessage: string;
    items: Record<string, { description: string; reaction: string }>;
    actorAction?: string; // e.g. 'idle', 'sleep'
}

export interface UserImpression {
    version: number;
    lastUpdated?: number;
    value_map: {
        likes: string[];
        dislikes: string[];
        core_values: string;
    };
    behavior_profile: {
        tone_style: string;
        emotion_summary: string;
        response_patterns: string;
    };
    emotion_schema: {
        triggers: {
            positive: string[];
            negative: string[];
        };
        comfort_zone: string;
        stress_signals: string[];
    };
    personality_core: {
        observed_traits: string[];
        interaction_style: string;
        summary: string;
    };
    mbti_analysis?: {
        type: string; 
        reasoning: string;
        dimensions: {
            e_i: number; 
            s_n: number; 
            t_f: number; 
            j_p: number; 
        }
    };
    observed_changes?: string[];
}

export interface BubbleStyle {
    textColor: string;
    backgroundColor: string;
    backgroundImage?: string;
    backgroundImageOpacity?: number;
    borderRadius: number;
    opacity: number;
    
    decoration?: string;
    decorationX?: number;
    decorationY?: number;
    decorationScale?: number;
    decorationRotate?: number;

    avatarDecoration?: string;
    avatarDecorationX?: number;
    avatarDecorationY?: number;
    avatarDecorationScale?: number;
    avatarDecorationRotate?: number;
}

export interface ChatTheme {
    id: string;
    name: string;
    type: 'preset' | 'custom';
    user: BubbleStyle;
    ai: BubbleStyle;
    customCss?: string;
}

export interface PhoneCustomApp {
    id: string;
    name: string;
    icon: string; 
    color: string; 
    prompt: string; 
}

export interface PhoneEvidence {
    id: string;
    type: 'chat' | 'order' | 'social' | 'delivery' | string; 
    title: string; 
    detail: string; 
    timestamp: number;
    systemMessageId?: number; 
    value?: string; 
}

// --- WORLDBOOK (NEW) ---
export interface Worldbook {
    id: string;
    title: string;
    content: string; // Lore text
    category: string; // Changed from tags[] to category string
    createdAt: number;
    updatedAt: number;
}

export interface CharacterProfile {
  id: string;
  name: string;
  avatar: string;
  description: string;
  systemPrompt: string;
  worldview?: string;
  memories: MemoryFragment[];
  refinedMemories?: Record<string, string>;
  activeMemoryMonths?: string[];
  
  // Mounted Worldbooks (Cached Content)
  // [Update]: Added 'category' for better context grouping
  mountedWorldbooks?: { id: string; title: string; content: string; category?: string }[];

  impression?: UserImpression;

  bubbleStyle?: string;
  chatBackground?: string;
  contextLimit?: number;
  hideSystemLogs?: boolean; 
  hideBeforeMessageId?: number; 
  
  dateBackground?: string;
  sprites?: Record<string, string>;
  spriteConfig?: SpriteConfig;
  
  socialProfile?: {
      handle: string; 
      bio?: string;   
  };

  roomConfig?: {
      bgImage?: string;
      wallImage?: string;
      floorImage?: string;
      items: RoomItem[];
      wallScale?: number; 
      wallRepeat?: boolean; 
      floorScale?: number;
      floorRepeat?: boolean;
  };
  
  lastRoomDate?: string;
  savedRoomState?: RoomGeneratedState;

  phoneState?: {
      records: PhoneEvidence[];
      customApps?: PhoneCustomApp[]; 
  };
}

export interface GroupProfile {
    id: string;
    name: string;
    members: string[]; 
    avatar?: string; 
    createdAt: number;
}

export interface CharacterExportData extends Omit<CharacterProfile, 'id' | 'memories' | 'refinedMemories' | 'activeMemoryMonths' | 'impression'> {
    version: number;
    type: 'sully_character_card';
    embeddedTheme?: ChatTheme;
}

export interface UserProfile {
    name: string;
    avatar: string;
    bio: string;
}

export interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

export interface GalleryImage {
    id: string;
    charId: string;
    url: string;
    timestamp: number;
    review?: string;
    reviewTimestamp?: number;
}

export interface StickerData {
    id: string;
    url: string;
    x: number;
    y: number;
    rotation: number;
    scale?: number; 
}

export interface DiaryPage {
    text: string;
    paperStyle: string;
    stickers: StickerData[];
}

export interface DiaryEntry {
    id: string;
    charId: string;
    date: string;
    userPage: DiaryPage;
    charPage?: DiaryPage;
    timestamp: number;
    isArchived: boolean;
}

export interface Task {
    id: string;
    title: string;
    supervisorId: string;
    tone: 'gentle' | 'strict' | 'tsundere';
    deadline?: string;
    isCompleted: boolean;
    completedAt?: number;
    createdAt: number;
}

export interface Anniversary {
    id: string;
    title: string;
    date: string;
    charId: string;
    aiThought?: string;
    lastThoughtGeneratedAt?: number;
}

export interface SocialComment {
    id: string;
    authorName: string;
    authorAvatar?: string;
    content: string;
    likes: number;
    isCharacter?: boolean; 
}

export interface SocialPost {
    id: string;
    authorName: string;
    authorAvatar: string;
    title: string;
    content: string;
    images: string[]; 
    likes: number;
    isCollected: boolean;
    isLiked: boolean;
    comments: SocialComment[];
    timestamp: number;
    tags: string[];
    bgStyle?: string; 
}

export interface SubAccount {
    id: string;
    handle: string; 
    note: string;   
}

export interface SocialAppProfile {
    name: string;
    avatar: string;
    bio: string;
}

export interface StudyChapter {
    id: string;
    title: string;
    summary: string;
    difficulty: 'easy' | 'normal' | 'hard';
    isCompleted: boolean;
    rawContentRange?: { start: number, end: number }; 
    content?: string; 
}

export interface StudyCourse {
    id: string;
    title: string;
    rawText: string; 
    chapters: StudyChapter[];
    currentChapterIndex: number;
    createdAt: number;
    coverStyle: string; 
    totalProgress: number; 
    preference?: string; 
}

// --- GAME / TRPG TYPES ---
export type GameTheme = 'fantasy' | 'cyber' | 'horror' | 'modern';

export interface GameActionOption {
    label: string;
    type: 'neutral' | 'chaotic' | 'evil';
}

export interface GameLog {
    id: string;
    role: 'gm' | 'player' | 'character' | 'system';
    speakerName?: string; // If character or player
    content: string;
    timestamp: number;
    diceRoll?: {
        result: number;
        max: number;
        check?: string; // e.g. "STR Check"
        success?: boolean;
    };
}

export interface GameSession {
    id: string;
    title: string;
    theme: GameTheme;
    worldSetting: string; // The "Lore"
    playerCharIds: string[]; // IDs of characters playing with user
    logs: GameLog[];
    status: {
        location: string;
        health: number; // HP
        sanity: number; // MP / Sanity
        gold: number;   // Currency
        inventory: string[];
    };
    suggestedActions?: GameActionOption[]; // Options for next turn
    createdAt: number;
    lastPlayedAt: number;
}
// ------------------------

export type MessageType = 'text' | 'image' | 'emoji' | 'interaction' | 'transfer' | 'system' | 'social_card';

export interface Message {
    id: number;
    charId: string; 
    groupId?: string; 
    role: 'user' | 'assistant' | 'system';
    type: MessageType;
    content: string;
    timestamp: number;
    metadata?: any; 
    replyTo?: {
        id: number;
        content: string;
        name: string;
    };
}

export interface FullBackupData {
    timestamp: number;
    version: number;
    theme?: OSTheme;
    apiConfig?: APIConfig;
    apiPresets?: ApiPreset[];
    availableModels?: string[];
    customIcons?: Record<string, string>;
    characters?: CharacterProfile[];
    groups?: GroupProfile[]; 
    messages?: Message[];
    customThemes?: ChatTheme[];
    savedEmojis?: {name: string, url: string}[];
    savedJournalStickers?: {name: string, url: string}[]; 
    assets?: { id: string, data: string }[];
    galleryImages?: GalleryImage[];
    userProfile?: UserProfile;
    diaries?: DiaryEntry[];
    tasks?: Task[];
    anniversaries?: Anniversary[];
    roomTodos?: RoomTodo[]; 
    roomNotes?: RoomNote[];
    socialPosts?: SocialPost[]; 
    courses?: StudyCourse[]; 
    games?: GameSession[];
    worldbooks?: Worldbook[]; 
    roomCustomAssets?: {name: string, image: string, defaultScale: number, description?: string}[]; // ADDED
    
    socialAppData?: {
        charHandles?: Record<string, SubAccount[]>;
        userProfile?: SocialAppProfile;
        userId?: string;
        userBg?: string;
    };
    
    mediaAssets?: {
        charId: string;
        sprites?: Record<string, string>;
        roomItems?: Record<string, string>; 
        backgrounds?: { chat?: string; date?: string; roomWall?: string; roomFloor?: string };
    }[];
}