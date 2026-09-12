// vite.config.js
import { defineConfig } from "file:///C:/Users/c/WorkBuddy/2026-08-07-01-06-08/amz-system/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/c/WorkBuddy/2026-08-07-01-06-08/amz-system/node_modules/@vitejs/plugin-react/dist/index.js";
var BUILD_ID = Date.now().toString(36);
var vite_config_default = defineConfig({
  plugins: [react()],
  build: {
    minify: false,
    rollupOptions: {
      treeshake: false,
      output: {
        entryFileNames: `assets/index-${BUILD_ID}.js`,
        chunkFileNames: `assets/[name]-${BUILD_ID}.js`,
        assetFileNames: `assets/[name]-${BUILD_ID}[extname]`
      }
    },
    esbuildOptions: {
      minifyIdentifiers: false,
      minifySyntax: false,
      minifyWhitespace: false,
      keepNames: true
      // 保留函数和类名, 防止 const/function 变量被 mangle (KK 2026-08-10)
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxjXFxcXFdvcmtCdWRkeVxcXFwyMDI2LTA4LTA3LTAxLTA2LTA4XFxcXGFtei1zeXN0ZW1cIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGNcXFxcV29ya0J1ZGR5XFxcXDIwMjYtMDgtMDctMDEtMDYtMDhcXFxcYW16LXN5c3RlbVxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvYy9Xb3JrQnVkZHkvMjAyNi0wOC0wNy0wMS0wNi0wOC9hbXotc3lzdGVtL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcclxuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xyXG5cclxuY29uc3QgQlVJTERfSUQgPSBEYXRlLm5vdygpLnRvU3RyaW5nKDM2KVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICBwbHVnaW5zOiBbcmVhY3QoKV0sXHJcbiAgYnVpbGQ6IHtcclxuICAgIG1pbmlmeTogZmFsc2UsXHJcbiAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgIHRyZWVzaGFrZTogZmFsc2UsXHJcbiAgICAgIG91dHB1dDoge1xyXG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiBgYXNzZXRzL2luZGV4LSR7QlVJTERfSUR9LmpzYCxcclxuICAgICAgICBjaHVua0ZpbGVOYW1lczogYGFzc2V0cy9bbmFtZV0tJHtCVUlMRF9JRH0uanNgLFxyXG4gICAgICAgIGFzc2V0RmlsZU5hbWVzOiBgYXNzZXRzL1tuYW1lXS0ke0JVSUxEX0lEfVtleHRuYW1lXWBcclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIGVzYnVpbGRPcHRpb25zOiB7XHJcbiAgICAgIG1pbmlmeUlkZW50aWZpZXJzOiBmYWxzZSxcclxuICAgICAgbWluaWZ5U3ludGF4OiBmYWxzZSxcclxuICAgICAgbWluaWZ5V2hpdGVzcGFjZTogZmFsc2UsXHJcbiAgICAgIGtlZXBOYW1lczogdHJ1ZSAvLyBcdTRGRERcdTc1NTlcdTUxRkRcdTY1NzBcdTU0OENcdTdDN0JcdTU0MEQsIFx1OTYzMlx1NkI2MiBjb25zdC9mdW5jdGlvbiBcdTUzRDhcdTkxQ0ZcdTg4QUIgbWFuZ2xlIChLSyAyMDI2LTA4LTEwKVxyXG4gICAgfVxyXG4gIH1cclxufSkiXSwKICAibWFwcGluZ3MiOiAiO0FBQXVWLFNBQVMsb0JBQW9CO0FBQ3BYLE9BQU8sV0FBVztBQUVsQixJQUFNLFdBQVcsS0FBSyxJQUFJLEVBQUUsU0FBUyxFQUFFO0FBRXZDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFBQSxFQUNqQixPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixlQUFlO0FBQUEsTUFDYixXQUFXO0FBQUEsTUFDWCxRQUFRO0FBQUEsUUFDTixnQkFBZ0IsZ0JBQWdCLFFBQVE7QUFBQSxRQUN4QyxnQkFBZ0IsaUJBQWlCLFFBQVE7QUFBQSxRQUN6QyxnQkFBZ0IsaUJBQWlCLFFBQVE7QUFBQSxNQUMzQztBQUFBLElBQ0Y7QUFBQSxJQUNBLGdCQUFnQjtBQUFBLE1BQ2QsbUJBQW1CO0FBQUEsTUFDbkIsY0FBYztBQUFBLE1BQ2Qsa0JBQWtCO0FBQUEsTUFDbEIsV0FBVztBQUFBO0FBQUEsSUFDYjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
