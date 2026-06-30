"use client";

import * as React from "react";
import {
  FiFileText,
  FiImage,
  FiMusic,
  FiVideo,
  FiCode,
  FiArchive,
  FiDatabase,
  FiFile,
} from "react-icons/fi";
import type { FileCategory } from "@/lib/mock/cid-indexer";

interface CategoryIconProps {
  category: FileCategory;
  mime?: string;
  size?: number;
  className?: string;
}

/** Maps MIME type / category to a small icon. Keeps the explorer scannable. */
const CategoryIcon = ({ category, size = 16, className }: CategoryIconProps) => {
  const map: Record<FileCategory, React.ElementType> = {
    document: FiFileText,
    image: FiImage,
    audio: FiMusic,
    video: FiVideo,
    data: FiDatabase,
    code: FiCode,
    archive: FiArchive,
    other: FiFile,
  };
  const Icon = map[category] ?? FiFile;
  return <Icon size={size} className={className} />;
};

export default CategoryIcon;
