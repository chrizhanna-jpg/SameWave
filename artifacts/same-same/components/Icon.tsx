import React from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  Camera,
  Check,
  ChevronRight,
  Globe,
  Heart,
  Image as ImageIcon,
  Layers,
  Link as LinkIcon,
  Map,
  MapPin,
  Play,
  RefreshCw,
  RotateCcw,
  Star,
  User,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react-native";

const ICONS: Record<string, LucideIcon> = {
  "alert-circle": AlertCircle,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  award: Award,
  camera: Camera,
  check: Check,
  "chevron-right": ChevronRight,
  globe: Globe,
  heart: Heart,
  image: ImageIcon,
  layers: Layers,
  link: LinkIcon,
  map: Map,
  "map-pin": MapPin,
  play: Play,
  "refresh-cw": RefreshCw,
  "rotate-ccw": RotateCcw,
  star: Star,
  user: User,
  x: X,
  zap: Zap,
};

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: object;
}

export function Icon({ name, size = 24, color = "#000", style }: IconProps) {
  const Component = ICONS[name] ?? ICONS.award;
  return <Component size={size} color={color} style={style} />;
}
