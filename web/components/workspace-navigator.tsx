"use client";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FolderPlus,
  FolderGit2,
  Folder,
  FolderOpen,
  GitBranch,
  Layers,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  blankPolicy,
  documentPolicy,
  type Workspace,
  type WorkspaceFolder,
  type WorkspaceItem,
} from "@/lib/workspace";
import {
  assertWorkspaceName,
  descendantFolders,
  folderPath,
  moveWorkspaceItem,
  renameWorkspaceItem,
  restoreWorkspaceItem,
  trashWorkspaceItem,
} from "@/lib/workspace-tree";
type Menu = { item: WorkspaceItem | null; x: number; y: number };
const equalItem = (a: WorkspaceItem | null, b: WorkspaceItem) =>
  a?.kind === b.kind && a.id === b.id;
export function WorkspaceNavigator({
  workspace,
  collapsed,
  onToggle,
  onChange,
  onOpen,
}: {
  workspace: Workspace;
  collapsed: boolean;
  onToggle: () => void;
  onChange: (workspace: Workspace, view?: "policy" | "canvas") => void;
  onOpen: (id: string, view?: "policy" | "canvas") => void;
}) {
  const [query, setQuery] = useState(""),
    [closed, setClosed] = useState<string[]>([]);
  const [creating, setCreating] = useState<
      "file" | "folder" | "project" | null
    >(null),
    [folderId, setFolderId] = useState<string | null>(null),
    [name, setName] = useState("");
  const [menu, setMenu] = useState<Menu | null>(null),
    [editing, setEditing] = useState<WorkspaceItem | null>(null),
    [rename, setRename] = useState("");
  const [moving, setMoving] = useState<WorkspaceItem | null>(null),
    [destination, setDestination] = useState("");
  const [error, setError] = useState(""),
    [lastDeleted, setLastDeleted] = useState(""),
    [dragging, setDragging] = useState<WorkspaceItem | null>(null),
    [dropTarget, setDropTarget] = useState<string | null>(null);
  const pointerDrag = useRef<{
      item: WorkspaceItem;
      x: number;
      y: number;
      dragged: boolean;
    } | null>(null),
    suppressClick = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null),
    opener = useRef<HTMLElement | null>(null);
  const active = workspace.documents.find(
    (document) => document.id === workspace.activeDocumentId,
  );
  const project =
    workspace.projects.find(
      (project) =>
        project.id === (active?.projectId || workspace.activeProjectId),
    ) || workspace.projects[0];
  const projectFolders = workspace.folders.filter(
    (folder) => folder.projectId === project.id,
  );
  const selectedFolder = folderId === null ? active?.folderId || "" : folderId;
  const targetFolder = projectFolders.find(
    (folder) => folder.id === selectedFolder,
  );
  const targetId = targetFolder?.id || "";
  const itemName = (item: WorkspaceItem) =>
    item.kind === "folder"
      ? workspace.folders.find((folder) => folder.id === item.id)?.name ||
        "Folder"
      : documentPolicy(
          workspace.documents.find((document) => document.id === item.id)!,
        ).name;
  useEffect(() => {
    setFolderId(null);
    setCreating(null);
    setEditing(null);
    setMoving(null);
    setMenu(null);
    setError("");
  }, [project.id]);
  useEffect(() => {
    if (!menu) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>("[role='menuitem']")
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const dismiss = () => setMenu(null);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [menu]);
  useEffect(() => {
    if (!dragging || !dropTarget || !closed.includes(dropTarget)) return;
    const timer = window.setTimeout(
      () => setClosed((previous) => previous.filter((id) => id !== dropTarget)),
      550,
    );
    return () => window.clearTimeout(timer);
  }, [dragging, dropTarget, closed]);
  useEffect(() => {
    function destinationAt(event: PointerEvent) {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      if (!element?.closest("[aria-label='Files and folders']")) return null;
      return (
        element.closest<HTMLElement>("[data-workspace-folder]")?.dataset
          .workspaceFolder || ""
      );
    }
    const move = (event: PointerEvent) => {
      const drag = pointerDrag.current;
      if (!drag) return;
      if (
        !drag.dragged &&
        Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6
      )
        return;
      drag.dragged = true;
      setDragging(drag.item);
      const target = destinationAt(event);
      try {
        if (target === null) throw new Error();
        moveWorkspaceItem(workspace, drag.item, target);
        setDropTarget(target);
      } catch {
        setDropTarget(null);
      }
    };
    const finish = (event: PointerEvent) => {
      const drag = pointerDrag.current;
      pointerDrag.current = null;
      if (drag?.dragged) {
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
        const target = destinationAt(event);
        if (target !== null)
          try {
            onChange(moveWorkspaceItem(workspace, drag.item, target));
            setFolderId(target);
            setClosed((previous) => previous.filter((id) => id !== target));
            setError("");
          } catch (error) {
            setError((error as Error).message);
          }
      }
      setDragging(null);
      setDropTarget(null);
    };
    const cancel = () => {
      pointerDrag.current = null;
      setDragging(null);
      setDropTarget(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [workspace, onChange]);
  function pointerStart(
    event: ReactPointerEvent<HTMLElement>,
    item: WorkspaceItem,
  ) {
    if (event.button !== 0 || editing) return;
    pointerDrag.current = {
      item,
      x: event.clientX,
      y: event.clientY,
      dragged: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  }
  function attempt(action: () => void) {
    try {
      action();
      setError("");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function showMenu(
    event: MouseEvent<HTMLElement>,
    item: WorkspaceItem | null,
  ) {
    event.preventDefault();
    event.stopPropagation();
    opener.current = event.currentTarget;
    if (item?.kind === "folder") setFolderId(item.id);
    if (item?.kind === "file")
      setFolderId(
        workspace.documents.find((document) => document.id === item.id)
          ?.folderId || "",
      );
    if (!item) setFolderId("");
    setMenu({
      item,
      x: Math.max(6, Math.min(event.clientX, window.innerWidth - 198)),
      y: Math.max(
        6,
        Math.min(
          event.clientY,
          window.innerHeight - (item?.kind === "folder" ? 224 : 150),
        ),
      ),
    });
  }
  function beginRename(item: WorkspaceItem) {
    setMenu(null);
    setMoving(null);
    setCreating(null);
    setEditing(item);
    setRename(itemName(item));
    setError("");
  }
  function submitRename() {
    if (!editing) return;
    attempt(() => {
      onChange(renameWorkspaceItem(workspace, editing, rename));
      setEditing(null);
    });
  }
  function remove(item: WorkspaceItem) {
    attempt(() => {
      const next = trashWorkspaceItem(workspace, item);
      setLastDeleted(next.trash!.at(-1)!.id);
      onChange(next);
      setMenu(null);
      setEditing(null);
      setFolderId(null);
    });
  }
  function restore(id: string) {
    attempt(() => {
      onChange(restoreWorkspaceItem(workspace, id));
      if (lastDeleted === id) setLastDeleted("");
      setClosed([]);
    });
  }
  function startCreate(type: "file" | "folder" | "project", parent?: string) {
    setMenu(null);
    setEditing(null);
    setMoving(null);
    setCreating(type);
    if (parent !== undefined) setFolderId(parent);
    setName("");
    setError("");
  }
  function create() {
    attempt(() => {
      if (!name.trim()) throw new Error("Enter a name.");
      const id = crypto.randomUUID();
      let next = workspace;
      if (creating === "project") {
        const document = {
          id: `${id}-document`,
          projectId: id,
          folderId: `${id}-workflows`,
          policy: blankPolicy("Untitled workflow"),
        };
        next = {
          ...workspace,
          projects: [...workspace.projects, { id, name: name.trim() }],
          folders: [
            ...workspace.folders,
            { id: `${id}-workflows`, projectId: id, name: "Workflows" },
          ],
          documents: [...workspace.documents, document],
          activeDocumentId: document.id,
          activeProjectId: id,
        };
      } else {
        assertWorkspaceName(workspace, project.id, targetId, name);
        if (creating === "folder") {
          next = {
            ...workspace,
            folders: [
              ...workspace.folders,
              {
                id,
                projectId: project.id,
                parentId: targetId || undefined,
                name: name.trim(),
              },
            ],
          };
          setFolderId(id);
          setClosed((previous) => previous.filter((item) => item !== targetId));
        } else {
          const document = {
            id,
            projectId: project.id,
            folderId: targetId,
            policy: blankPolicy(name.trim()),
          };
          next = {
            ...workspace,
            documents: [...workspace.documents, document],
            activeDocumentId: id,
            activeProjectId: project.id,
          };
          setClosed((previous) => previous.filter((item) => item !== targetId));
        }
      }
      onChange(next, "canvas");
      setCreating(null);
      setName("");
    });
  }
  function move(item: WorkspaceItem, parentId: string) {
    attempt(() => {
      onChange(moveWorkspaceItem(workspace, item, parentId));
      setClosed((previous) => previous.filter((id) => id !== parentId));
      setFolderId(parentId);
      setMoving(null);
    });
  }
  function shortcut(event: KeyboardEvent<HTMLElement>, item: WorkspaceItem) {
    if (event.key === "F2") {
      event.preventDefault();
      beginRename(item);
    }
    if (event.key === "Delete") {
      event.preventDefault();
      remove(item);
    }
    if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      opener.current = event.currentTarget;
      setMenu({
        item,
        x: Math.min(rect.left + 14, window.innerWidth - 198),
        y: Math.max(6, Math.min(rect.bottom, window.innerHeight - 224)),
      });
    }
  }
  function renameForm(item: WorkspaceItem) {
    return (
      <form
        className="explorer-rename"
        onSubmit={(event) => {
          event.preventDefault();
          submitRename();
        }}
      >
        <input
          autoFocus
          aria-label={`Rename ${item.kind}`}
          value={rename}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setRename(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              setEditing(null);
              setError("");
            }
          }}
        />
        <button title="Save name" aria-label="Save name">
          <Check size={12} />
        </button>
        <button
          type="button"
          title="Cancel rename"
          aria-label="Cancel rename"
          onClick={() => {
            setEditing(null);
            setError("");
          }}
        >
          <X size={12} />
        </button>
      </form>
    );
  }
  const search = query.trim().toLowerCase();
  function matchesFolder(folder: WorkspaceFolder): boolean {
    const ids = descendantFolders(workspace, folder.id);
    return [
      ...projectFolders
        .filter((item) => ids.has(item.id))
        .map((item) => item.name),
      ...workspace.documents
        .filter((document) => ids.has(document.folderId))
        .map((document) => documentPolicy(document).name),
    ].some((name) => name.toLowerCase().includes(search));
  }
  function files(parentId: string, showAll = false) {
    return workspace.documents
      .filter(
        (document) =>
          document.projectId === project.id &&
          document.folderId === parentId &&
          (showAll ||
            documentPolicy(document).name.toLowerCase().includes(search)),
      )
      .sort((a, b) =>
        documentPolicy(a).name.localeCompare(documentPolicy(b).name),
      )
      .map((document) => {
        const item: WorkspaceItem = { kind: "file", id: document.id },
          name = documentPolicy(document).name;
        return (
          <div
            key={document.id}
            data-workspace-file={document.id}
            className={`project-file ${document.id === workspace.activeDocumentId ? "active" : ""} ${equalItem(dragging, item) ? "is-dragging" : ""}`}
            draggable={false}
            onContextMenu={(event) => showMenu(event, item)}
          >
            {equalItem(editing, item) ? (
              renameForm(item)
            ) : (
              <>
                <button
                  title={name}
                  className="explorer-draggable"
                  onPointerDown={(event) => pointerStart(event, item)}
                  draggable={false}
                  onKeyDown={(event) => shortcut(event, item)}
                  onClick={() => {
                    if (suppressClick.current) return;
                    setFolderId(document.folderId);
                    onOpen(document.id, "canvas");
                  }}
                >
                  <GitBranch size={13} />
                  <span>{name}</span>
                  {document.draft && <i title="Unvalidated draft" />}
                </button>
                <button
                  className="explorer-more"
                  aria-label={`Actions for file ${name}`}
                  title="File actions"
                  onClick={(event) => showMenu(event, item)}
                >
                  <MoreHorizontal size={13} />
                </button>
              </>
            )}
          </div>
        );
      });
  }
  function folders(parentId: string, showAll = false): React.ReactNode {
    return projectFolders
      .filter(
        (folder) =>
          (folder.parentId || "") === parentId &&
          (!search || showAll || matchesFolder(folder)),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((folder) => {
        const item: WorkspaceItem = { kind: "folder", id: folder.id },
          expanded = !!search || !closed.includes(folder.id),
          showChildren =
            showAll || (!!search && folder.name.toLowerCase().includes(search));
        const count = workspace.documents.filter((document) =>
          descendantFolders(workspace, folder.id).has(document.folderId),
        ).length;
        return (
          <div
            key={folder.id}
            data-workspace-folder={folder.id}
            className={`project-folder-branch ${equalItem(dragging, item) ? "is-dragging" : ""}`}
          >
            <div
              className={`project-folder-row ${targetId === folder.id ? "folder-selected" : ""} ${dropTarget === folder.id ? "drop-target" : ""}`}
              draggable={false}
              onContextMenu={(event) => showMenu(event, item)}
            >
              {equalItem(editing, item) ? (
                renameForm(item)
              ) : (
                <>
                  <button
                    title={folderPath(workspace, folder.id)}
                    className="explorer-draggable"
                    onPointerDown={(event) => pointerStart(event, item)}
                    draggable={false}
                    aria-expanded={expanded}
                    onKeyDown={(event) => shortcut(event, item)}
                    onClick={() => {
                      if (suppressClick.current) return;
                      setFolderId(folder.id);
                      setClosed(
                        expanded
                          ? [...closed, folder.id]
                          : closed.filter((id) => id !== folder.id),
                      );
                    }}
                  >
                    {expanded ? (
                      <ChevronDown size={11} />
                    ) : (
                      <ChevronRight size={11} />
                    )}{" "}
                    {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                    <span>{folder.name}</span>
                    <small>{count}</small>
                  </button>
                  <button
                    className="explorer-more"
                    aria-label={`Actions for folder ${folder.name}`}
                    title="Folder actions"
                    onClick={(event) => showMenu(event, item)}
                  >
                    <MoreHorizontal size={13} />
                  </button>
                </>
              )}
            </div>
            {expanded && (
              <div className="project-files">
                {folders(folder.id, showChildren)}
                {files(folder.id, showChildren)}
                {!projectFolders.some(
                  (child) => child.parentId === folder.id,
                ) &&
                  !workspace.documents.some(
                    (document) => document.folderId === folder.id,
                  ) && <small className="project-empty">Empty folder</small>}
              </div>
            )}
          </div>
        );
      });
  }
  const lastEntry = workspace.trash?.find((item) => item.id === lastDeleted);
  const forbidden =
    moving?.kind === "folder"
      ? descendantFolders(workspace, moving.id)
      : new Set<string>();
  return (
    <aside
      className={`project-navigation ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Project explorer"
    >
      <div className="project-nav-heading">
        {!collapsed && (
          <>
            <span className="project-mark">
              <Layers size={15} />
            </span>
            <select
              aria-label="Active project"
              value={project.id}
              onChange={(event) => {
                const document = workspace.documents.find(
                  (document) => document.projectId === event.target.value,
                );
                onChange(
                  {
                    ...workspace,
                    activeProjectId: event.target.value,
                    activeDocumentId: document?.id || "",
                  },
                  "canvas",
                );
              }}
            >
              {workspace.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </>
        )}
        <button
          aria-label={
            collapsed ? "Expand project explorer" : "Collapse project explorer"
          }
          onClick={onToggle}
        >
          {collapsed ? (
            <PanelLeftOpen size={15} />
          ) : (
            <PanelLeftClose size={15} />
          )}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="project-search">
            <Search size={13} />
            <input
              aria-label="Search workspace"
              placeholder="Search files…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="project-tree-heading">
            <span>WORKSPACE</span>
            <div className="explorer-actions">
              {(
                [
                  ["file", "New workflow", FilePlus2],
                  ["folder", "New folder", FolderPlus],
                  ["project", "New project", FolderGit2],
                ] as const
              ).map(([type, label, Icon]) => (
                <button
                  key={type}
                  aria-label={label}
                  title={label}
                  data-tooltip={label}
                  aria-pressed={creating === type}
                  onClick={() =>
                    creating === type ? setCreating(null) : startCreate(type)
                  }
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>
          {creating && (
            <form
              className="workspace-create"
              onSubmit={(event) => {
                event.preventDefault();
                create();
              }}
            >
              <div className="create-caption">
                <span>
                  {creating === "project"
                    ? "New project"
                    : `New ${creating === "file" ? "workflow" : "folder"} in ${targetFolder ? folderPath(workspace, targetFolder.id) : project.name}`}
                </span>
                <button
                  type="button"
                  aria-label="Cancel creation"
                  onClick={() => setCreating(null)}
                >
                  <X size={12} />
                </button>
              </div>
              <input
                key={`${creating}:${targetId}`}
                autoFocus
                aria-label="New item name"
                placeholder={
                  creating === "file"
                    ? "Workflow name"
                    : creating === "folder"
                      ? "Folder name"
                      : "Project name"
                }
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setCreating(null);
                }}
              />
              <button type="submit">Create</button>
            </form>
          )}
          {moving && (
            <form
              className="workspace-create"
              onSubmit={(event) => {
                event.preventDefault();
                move(moving, destination);
              }}
            >
              <div className="create-caption">
                <span>Move {itemName(moving)}</span>
                <button
                  type="button"
                  aria-label="Cancel move"
                  onClick={() => setMoving(null)}
                >
                  <X size={12} />
                </button>
              </div>
              <select
                autoFocus
                aria-label="Move destination"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
              >
                <option value="">{project.name} / (root)</option>
                {projectFolders.map((folder) => (
                  <option
                    key={folder.id}
                    value={folder.id}
                    disabled={forbidden.has(folder.id)}
                  >
                    {folderPath(workspace, folder.id)}
                  </option>
                ))}
              </select>
              <button>Move</button>
            </form>
          )}
          {error && (
            <p className="explorer-error" role="alert">
              {error}
            </p>
          )}
          {lastEntry && (
            <div className="explorer-undo" role="status">
              <span>Moved {lastEntry.label} to Trash</span>
              <button onClick={() => restore(lastEntry.id)}>Undo</button>
              <button
                aria-label="Dismiss undo"
                onClick={() => setLastDeleted("")}
              >
                <X size={11} />
              </button>
            </div>
          )}
          <nav
            className="project-tree"
            aria-label="Files and folders"
            onContextMenu={(event) => showMenu(event, null)}
          >
            <button
              className={`project-root-row ${dropTarget === "" ? "drop-target" : ""}`}
              aria-label="Select project root"
              title="New items and dropped files go here"
              onClick={() => setFolderId("")}
              onContextMenu={(event) => showMenu(event, null)}
            >
              <FolderOpen size={12} />
              <span>Project root</span>
            </button>
            {folders("")}
            {files("")}
            {!projectFolders.length &&
              !workspace.documents.some(
                (document) => document.projectId === project.id,
              ) && (
                <p className="project-empty">
                  No files yet. Create a workflow or restore one from Trash.
                </p>
              )}
          </nav>
          {!!workspace.trash?.filter((entry) => entry.projectId === project.id)
            .length && (
            <details className="explorer-trash">
              <summary>
                <Trash2 size={12} />
                Trash{" "}
                <small>
                  {
                    workspace.trash.filter(
                      (entry) => entry.projectId === project.id,
                    ).length
                  }
                </small>
              </summary>
              {workspace.trash
                .filter((entry) => entry.projectId === project.id)
                .map((entry) => (
                  <div key={entry.id}>
                    <span title={entry.label}>
                      {entry.item.kind === "folder" ? (
                        <Folder size={12} />
                      ) : (
                        <GitBranch size={12} />
                      )}{" "}
                      {entry.label}
                    </span>
                    <button
                      aria-label={`Restore ${entry.label}`}
                      title="Restore"
                      onClick={() => restore(entry.id)}
                    >
                      <Undo2 size={12} />
                    </button>
                  </div>
                ))}
            </details>
          )}
          <div className="project-nav-footer">
            <span className="status-dot" />
            Local workspace{" "}
            <span>Right-click for actions · drag to reorganize</span>
          </div>
        </>
      )}
      {menu && (
        <div
          ref={menuRef}
          className="explorer-context-menu"
          role="menu"
          aria-label="Explorer actions"
          style={{ left: menu.x, top: menu.y }}
          onKeyDown={(event) => {
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "[role='menuitem']",
              ),
            );
            const index = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              items[
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length
              ]?.focus();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setMenu(null);
              opener.current?.focus();
            }
            if (event.key === "Tab") setMenu(null);
          }}
        >
          {(!menu.item || menu.item.kind === "folder") && (
            <>
              <button
                role="menuitem"
                onClick={() => startCreate("file", menu.item?.id || "")}
              >
                <FilePlus2 size={13} />
                New workflow
              </button>
              <button
                role="menuitem"
                onClick={() => startCreate("folder", menu.item?.id || "")}
              >
                <FolderPlus size={13} />
                {menu.item ? "New subfolder" : "New folder"}
              </button>
              {menu.item && <hr />}
            </>
          )}
          {menu.item && (
            <>
              <button role="menuitem" onClick={() => beginRename(menu.item!)}>
                <Pencil size={13} />
                Rename<span>F2</span>
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMoving(menu.item);
                  setMenu(null);
                  setCreating(null);
                  setEditing(null);
                  setDestination("");
                  setError("");
                }}
              >
                <FolderOpen size={13} />
                Move to…
              </button>
              <hr />
              <button
                role="menuitem"
                className="danger"
                onClick={() => remove(menu.item!)}
              >
                <Trash2 size={13} />
                Delete<span>Del</span>
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
