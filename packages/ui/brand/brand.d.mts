export declare const SITES: { app: string; validator: string; docs: string };
export declare const COLORS: { seal: string; paper: string; paperDark: string };
export declare const ICON_FILES: string[];
export declare const OG_IMAGE: { file: string; width: number; height: number; alt: string };
export declare function robotsTxt(siteUrl: string): string;
export declare function sitemapXml(siteUrl: string, pages: string[]): string;
export declare function writeBrandFiles(destDir: string, opts: { siteUrl: string; pages?: string[] }): void;
