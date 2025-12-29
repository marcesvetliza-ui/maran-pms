// Chat storage for AI conversations - uses in-memory storage
// Note: conversations and messages tables are defined in @shared/schema

export interface IChatStorage {
  getConversation(id: string): Promise<{ id: string; title: string; createdAt: string } | undefined>;
  getAllConversations(): Promise<{ id: string; title: string; createdAt: string }[]>;
  createConversation(title: string): Promise<{ id: string; title: string; createdAt: string }>;
  deleteConversation(id: string): Promise<void>;
  getMessagesByConversation(conversationId: string): Promise<{ id: string; conversationId: string; role: string; content: string; createdAt: string }[]>;
  createMessage(conversationId: string, role: string, content: string): Promise<{ id: string; conversationId: string; role: string; content: string; createdAt: string }>;
}

// In-memory storage for chat
const conversationsMap = new Map<string, { id: string; title: string; createdAt: string }>();
const messagesMap = new Map<string, { id: string; conversationId: string; role: string; content: string; createdAt: string }>();

export const chatStorage: IChatStorage = {
  async getConversation(id: string) {
    return conversationsMap.get(id);
  },

  async getAllConversations() {
    return Array.from(conversationsMap.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  async createConversation(title: string) {
    const id = crypto.randomUUID();
    const conversation = { id, title, createdAt: new Date().toISOString() };
    conversationsMap.set(id, conversation);
    return conversation;
  },

  async deleteConversation(id: string) {
    conversationsMap.delete(id);
    const entries = Array.from(messagesMap.entries());
    for (const [msgId, msg] of entries) {
      if (msg.conversationId === id) {
        messagesMap.delete(msgId);
      }
    }
  },

  async getMessagesByConversation(conversationId: string) {
    return Array.from(messagesMap.values())
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  },

  async createMessage(conversationId: string, role: string, content: string) {
    const id = crypto.randomUUID();
    const message = { id, conversationId, role, content, createdAt: new Date().toISOString() };
    messagesMap.set(id, message);
    return message;
  },
};

