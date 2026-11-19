import type { FileView } from "obsidian";
import type QuietOutline from "@/plugin";
import { store, type Heading } from "@/store";
import { calcModifies } from "@/utils/diff";
import { Nav } from "./base";

interface ReadoutOutlineEntry {
    index: number;
    label: string;
    startLine: number;
    level: number;
    layoutId: string;
    isCover: boolean;
    isSection: boolean;
    title: string;
    sectionNumber?: string;
}

interface ReadoutViewLike extends FileView {
    currentPage?: number;
    getOutline?: () => ReadoutOutlineEntry[];
    goToPage?: (idx: number) => void;
    onPageChange?: (cb: (idx: number) => void) => () => void;
    onOutlineChange?: (cb: () => void) => () => void;
}

export interface ReadoutHeading extends Heading {
    pageIndex?: number;
    line?: number;
}

export class ReadoutNav extends Nav {
    declare view: ReadoutViewLike;

    constructor(plugin: QuietOutline, view: ReadoutViewLike) {
        super(plugin, view);
        this.view = view;
    }

    getId(): string {
        return "readout";
    }

    getPath(): string {
        return this.view.file?.path || "";
    }

    async onload(): Promise<void> {
        if (typeof this.view.onPageChange === "function") {
            const unsubPage = this.view.onPageChange((pageIdx) => {
                this.syncActivePage(pageIdx);
            });
            this.register(unsubPage);
        }
        if (typeof this.view.onOutlineChange === "function") {
            const unsubOutline = this.view.onOutlineChange(() => {
                void this.updateHeaders();
            });
            this.register(unsubOutline);
        }
    }

    private syncActivePage(pageIdx: number): void {
        const headers = store.headers as ReadoutHeading[];
        const idx = headers.findIndex((h) => h.pageIndex === pageIdx);
        if (idx !== -1) {
            this.plugin.outlineView?.vueInstance.onPosChange(idx);
        }
    }

    async getHeaders(): Promise<ReadoutHeading[]> {
        const entries = this.view.getOutline?.();
        if (entries && entries.length > 0) {
            const hasSections = entries.some((e) => e.isSection);
            return entries.map((e) => ({
                title: e.isSection && e.sectionNumber ? `${e.sectionNumber} · ${e.title}` : e.title,
                level: hasSections ? (e.isCover || e.isSection ? 1 : 2) : 2,
                pageIndex: e.index,
                line: Math.max(0, e.startLine - 1),
            }));
        }
        const cache = this.view.file && this.plugin.app.metadataCache.getFileCache(this.view.file);
        const headings = cache?.headings || [];
        return headings.map((h) => ({
            title: h.heading,
            level: h.level,
            line: h.position.start.line,
        }));
    }

    async setHeaders(): Promise<void> {
        store.headers = await this.getHeaders();
        if (typeof this.view.currentPage === "number") {
            this.syncActivePage(this.view.currentPage);
        }
    }

    async updateHeaders(): Promise<void> {
        const next = await this.getHeaders();
        store.modifyKeys = calcModifies(store.headers, next);
        store.headers = next;
        if (typeof this.view.currentPage === "number") {
            this.syncActivePage(this.view.currentPage);
        }
    }

    async jump(index: number): Promise<void> {
        const target = (store.headers as ReadoutHeading[])[index];
        if (!target) return;
        this.plugin.outlineView?.vueInstance.onPosChange(index);
        if (typeof target.pageIndex === "number" && typeof this.view.goToPage === "function") {
            this.view.goToPage(target.pageIndex);
            return;
        }
        if (typeof target.line === "number") {
            this.view.setEphemeralState({ line: target.line });
        }
    }
}
