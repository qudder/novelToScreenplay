import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./shell/AppShell";
import { ImportPage } from "../features/import/ImportPage";
import { CharactersPage } from "../features/characters/CharactersPage";
import { RelationshipsPage } from "../features/relationships/RelationshipsPage";
import { TimelinePage } from "../features/timeline/TimelinePage";
import { ScenesPage } from "../features/scenes/ScenesPage";
import { ScreenplayPage } from "../features/screenplay/ScreenplayPage";
import { ScreenplayOverviewPage } from "../features/screenplay/ScreenplayOverviewPage";
import { VideoGenerationPage } from "../features/video/VideoGenerationPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/import" replace /> },
      { path: "import", element: <ImportPage /> },
      { path: "characters", element: <CharactersPage /> },
      { path: "relationships", element: <RelationshipsPage /> },
      { path: "timeline", element: <TimelinePage /> },
      { path: "scenes", element: <ScenesPage /> },
      { path: "screenplay", element: <ScreenplayPage /> },
      { path: "screenplay-overview", element: <ScreenplayOverviewPage /> },
      { path: "video-generation", element: <VideoGenerationPage /> }
    ]
  }
]);
