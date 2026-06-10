import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CollectionLink } from "../../lib/collection";
import type { FileNode } from "../../lib/types";
import "../Sidebar.css";

export function CollectionLinkRow({
  link,
  depth,
  indexPath,
  selectedPath,
  onSelect,
  onRemoveFromCollection,
}: {
  link: CollectionLink;
  depth: number;
  indexPath: string;
  selectedPath: string | null;
  onSelect: (node: FileNode) => void;
  onRemoveFromCollection: (indexPath: string, key: string) => void;
}) {
  const { t } = useTranslation();
  const indent = `${12 + depth * 14}px`;
  const resolved = link.node;
  const isSelected = !!resolved && resolved.path === selectedPath;

  async function showMenu() {
    const removeMenuItem = await MenuItem.new({
      text: t("sidebar.remove_from_collection"),
      action: () => onRemoveFromCollection(indexPath, link.key),
    });
    const items = resolved
      ? [
          await MenuItem.new({ text: t("sidebar.open"), action: () => onSelect(resolved) }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          removeMenuItem,
        ]
      : [removeMenuItem];
    const menu = await Menu.new({ items });
    await menu.popup();
  }

  return (
    <div
      role="none"
      className={`sidebar-file-row${isSelected ? " selected" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        showMenu();
      }}
    >
      <button
        type="button"
        className={`sidebar-file sidebar-collection-link${resolved ? "" : " unresolved"}`}
        style={{ paddingLeft: indent }}
        disabled={!resolved}
        title={resolved ? undefined : t("sidebar.collection_missing", { slug: link.slug })}
        onClick={() => resolved && onSelect(resolved)}
      >
        <span className="sidebar-file-icon-wrap">
          <Link2 size={13} className="sidebar-file-icon sidebar-file-icon-generic" />
        </span>
        <span className="sidebar-file-name">{link.label}</span>
      </button>
    </div>
  );
}
