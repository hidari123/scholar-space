/**
 * 浏览器入口。
 *
 * ⚠️ **`StrictMode` 要开** —— 开发时暴露副作用问题。
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";

const container = document.getElementById("root");

if (!container) {
	throw new Error("找不到 #root 容器");
}

createRoot(container).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
