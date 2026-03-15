import {
  ArrowLeftRight,
  BookOpen,
  File,
  FileText,
  LayoutTemplate,
  ListOrdered,
  StickyNote,
} from "lucide-react";

interface ContentTypeIconProps {
  type: string | undefined;
  size?: number;
  className?: string;
}

export function ContentTypeIcon({ type, size = 13, className = "" }: ContentTypeIconProps) {
  const props = { size, className };
  switch (type) {
    case "post":
      return <FileText {...props} />;
    case "flow":
      return <ArrowLeftRight {...props} />;
    case "series":
      return <ListOrdered {...props} />;
    case "book":
      return <BookOpen {...props} />;
    case "page":
      return <LayoutTemplate {...props} />;
    case "note":
      return <StickyNote {...props} />;
    default:
      return <File {...props} />;
  }
}
