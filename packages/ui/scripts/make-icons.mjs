#!/usr/bin/env node
// Puts the brand icons, the social card, robots.txt and sitemap.xml into public/ (packages/ui/brand/brand.mjs has the
// details). Runs before dev and build; the copies in public/ are build output and stay out of git.
import { fileURLToPath } from 'node:url';
import { SITES, writeBrandFiles } from '../brand/brand.mjs';

writeBrandFiles(fileURLToPath(new URL('../public', import.meta.url)), { siteUrl: SITES.app });
console.log('wrote the brand icons, og-image.png, robots.txt and sitemap.xml to public/');
