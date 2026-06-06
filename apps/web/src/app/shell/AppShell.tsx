import { NavLink, Outlet } from "react-router-dom";
import {
  BookOpen,
  Clapperboard,
  GitBranch,
  Layers,
  Upload,
  Users
} from "lucide-react";

const navItems = [
  { to: "/import", label: "小说导入", icon: Upload },
  { to: "/characters", label: "角色管理", icon: Users },
  { to: "/relationships", label: "人物关系图", icon: GitBranch },
  { to: "/timeline", label: "事件时间线", icon: BookOpen },
  { to: "/scenes", label: "场景拆分板", icon: Layers },
  { to: "/screenplay", label: "剧本生成", icon: Clapperboard }
];

export function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">剧</span>
          <div>
            <strong>小说转剧本</strong>
            <small>Adaptation Studio</small>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className="nav-link">
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <main className="workspace">
        <Outlet />
      </main>
    </div>
  );
}

