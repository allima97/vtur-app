/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
	interface Locals {
		userId?: string;
		userEmail?: string;
	}
}

interface ImportMetaEnv {
	readonly PUBLIC_SUPABASE_URL: string;
	readonly PUBLIC_SUPABASE_ANON_KEY: string;
	readonly SUPABASE_URL?: string;
	readonly SUPABASE_ANON_KEY?: string;
	readonly SUPABASE_SERVICE_ROLE_KEY?: string;
}
interface ImportMeta {
	readonly env: ImportMetaEnv;
}
