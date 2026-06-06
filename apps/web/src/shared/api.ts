import { chapters, characters, events, relationships, scenes } from "./mockData";

export const studioApi = {
  async getWorkspace() {
    return {
      chapters,
      characters,
      events,
      relationships,
      scenes
    };
  }
};

