import { Notice, type App, type MarkdownView, type TFolder } from "obsidian";

type NotebookNavigation = {
    navigateToFolder(folder: TFolder): Promise<boolean>;
};

type AppWithNotebookNavigator = App & {
    plugins?: {
        plugins?: Record<string, {
            api?: { navigation?: NotebookNavigation };
        } | undefined>;
    };
};

/** Prefer the navigator's documented API without patching core navigation. */
export function installFolderBreadcrumbNavigation(
    view: MarkdownView,
    host: HTMLElement,
): () => void {
    const onClick = (event: MouseEvent) => {
        if (event.defaultPrevented || event.button !== 0
            || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

        // Use the owning document, so this also works in pop-out windows.
        const target = event.target as Element | null;
        if (typeof target?.closest !== "function") return;
        const crumb = target.closest<HTMLElement>(".view-header-breadcrumb");
        const parent = crumb?.closest<HTMLElement>(".view-header-title-parent");
        if (!crumb || !parent || !host.contains(parent)) return;

        const navigation = (view.app as AppWithNotebookNavigator)
            .plugins?.plugins?.["notebook-navigator"]?.api?.navigation;
        if (typeof navigation?.navigateToFolder !== "function") return;

        // Resolve by ancestor position rather than visible text, which may be
        // truncated or repeated at multiple levels of the same path.
        const crumbs = Array.from(parent.querySelectorAll(".view-header-breadcrumb"));
        const index = crumbs.indexOf(crumb);
        const ancestors: TFolder[] = [];
        for (let folder = view.file?.parent; folder && folder.path !== "/"; folder = folder.parent) {
            ancestors.unshift(folder);
        }
        const folder = ancestors[index];
        if (!folder || crumbs.length !== ancestors.length
            || view.app.vault.getFolderByPath(folder.path) !== folder) return;

        // Capture before the core breadcrumb's own click listener can open the
        // built-in file explorer. Context menus, dragging, and rename stay native.
        event.preventDefault();
        event.stopImmediatePropagation();
        void revealFolder(view.app, navigation, folder);
    };

    host.addEventListener("click", onClick, true);
    return () => host.removeEventListener("click", onClick, true);
}

async function revealFolder(app: App, navigation: NotebookNavigation, folder: TFolder): Promise<void> {
    try {
        const revealed = await navigation.navigateToFolder(folder);
        if (!revealed) {
            new Notice("Notebook Navigator 无法定位此文件夹。");
            return;
        }
        // The API can reuse an existing but hidden navigator. Reveal that leaf
        // explicitly so a collapsed sidebar or a different sidebar tab is handled.
        const leaf = app.workspace.getLeavesOfType("notebook-navigator")[0];
        if (leaf) await app.workspace.revealLeaf(leaf);
    } catch (error) {
        console.error("Quiet Outline: Notebook Navigator folder navigation failed", error);
        new Notice("Notebook Navigator 无法定位此文件夹。");
    }
}
