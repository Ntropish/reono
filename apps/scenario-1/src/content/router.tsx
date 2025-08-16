import { z } from "zod";
import { authGuard, type User } from "../middleware/auth";
import { uploadRateLimit, userBasedRateLimit } from "../middleware/rate-limit";

// Content data models
export interface Article {
  id: number;
  title: string;
  content: string;
  authorId: number;
  authorName: string;
  imageUrl?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  published: boolean;
}

export interface UploadedFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedBy: number;
  uploadedAt: string;
}

// In-memory storage (in real app, use database)
const articles: Article[] = [
  {
    id: 1,
    title: "Welcome to our CMS",
    content: "This is a sample article with our content management system.",
    authorId: 1,
    authorName: "Admin User",
    tags: ["welcome", "cms"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    published: true,
  },
];

const uploadedFiles: UploadedFile[] = [];

// Validation schemas
const createArticleSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  published: z.boolean().default(false),
  imageUrl: z.string().url().optional(),
});

const updateArticleSchema = createArticleSchema.partial();

const articleParamsSchema = z.object({
  id: z.coerce.number(),
});

// File upload validation
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Middleware for file upload validation
const validateFileUpload = async (c: any, next: any) => {
  const contentType = c.req.headers.get('content-type');
  
  // POST requests to upload endpoint must be multipart
  if (c.req.method === 'POST' && !contentType?.startsWith('multipart/form-data')) {
    return new Response(
      JSON.stringify({ error: 'No file provided' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // If not a POST or not multipart, continue (for GET requests etc.)
  if (!contentType?.startsWith('multipart/form-data')) {
    return next();
  }

  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid file type',
          allowedTypes: ALLOWED_IMAGE_TYPES,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ 
          error: 'File too large',
          maxSize: MAX_FILE_SIZE,
          actualSize: file.size,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Add validated file to context
    (c as any).file = file;
    (c as any).formData = formData;
    
    return next();
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to parse multipart data' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// Route handlers
const getAllArticles = (c: any) => {
  const user = c.user as User;
  
  // Filter articles based on user role
  let filteredArticles = articles;
  
  if (user.role !== 'admin') {
    // Regular users see only published articles and their own drafts
    filteredArticles = articles.filter(
      article => article.published || article.authorId === user.id
    );
  }
  
  return c.json({
    articles: filteredArticles,
    total: filteredArticles.length,
  });
};

const getArticle = (c: any) => {
  const user = c.user as User;
  const { id } = c.params;
  
  const article = articles.find(a => a.id === id);
  if (!article) {
    return new Response(
      JSON.stringify({ error: 'Article not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // Check access permissions
  if (!article.published && article.authorId !== user.id && user.role !== 'admin') {
    return new Response(
      JSON.stringify({ error: 'Access denied' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  return c.json(article);
};

const createArticle = (c: any) => {
  const user = c.user as User;
  
  const newArticle: Article = {
    id: Math.max(...articles.map(a => a.id), 0) + 1,
    ...c.body,
    authorId: user.id,
    authorName: user.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  articles.push(newArticle);
  
  return c.json(newArticle, 201);
};

const updateArticle = (c: any) => {
  const user = c.user as User;
  const { id } = c.params;
  
  const articleIndex = articles.findIndex(a => a.id === id);
  if (articleIndex === -1) {
    return new Response(
      JSON.stringify({ error: 'Article not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  const article = articles[articleIndex]!;
  
  // Check permissions - authors can edit their own, admins can edit any
  if (article.authorId !== user.id && user.role !== 'admin') {
    return new Response(
      JSON.stringify({ error: 'Access denied' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  const updatedArticle = {
    ...article,
    ...c.body,
    updatedAt: new Date().toISOString(),
  };
  
  articles[articleIndex] = updatedArticle;
  
  return c.json(updatedArticle);
};

const deleteArticle = (c: any) => {
  const user = c.user as User;
  const { id } = c.params;
  
  const articleIndex = articles.findIndex(a => a.id === id);
  if (articleIndex === -1) {
    return new Response(
      JSON.stringify({ error: 'Article not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  const article = articles[articleIndex]!;
  
  // Check permissions - authors can delete their own, admins can delete any
  if (article.authorId !== user.id && user.role !== 'admin') {
    return new Response(
      JSON.stringify({ error: 'Access denied' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  articles.splice(articleIndex, 1);
  return new Response(null, { status: 204 });
};

const uploadImage = async (c: any) => {
  const user = c.user as User;
  const file = (c as any).file as File;
  
  if (!file) {
    return new Response(
      JSON.stringify({ error: 'No file provided' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // In a real app, you'd save this to S3, filesystem, etc.
  // For demo, we'll just create a mock URL
  const fileId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const mockUrl = `/uploads/${fileId}-${file.name}`;
  
  const uploadedFile: UploadedFile = {
    id: fileId,
    filename: file.name,
    mimeType: file.type,
    size: file.size,
    url: mockUrl,
    uploadedBy: user.id,
    uploadedAt: new Date().toISOString(),
  };
  
  uploadedFiles.push(uploadedFile);
  
  return c.json(uploadedFile, 201);
};

const getUploads = (c: any) => {
  const user = c.user as User;
  
  // Users see their own uploads, admins see all
  const filteredUploads = user.role === 'admin' 
    ? uploadedFiles 
    : uploadedFiles.filter(f => f.uploadedBy === user.id);
  
  return c.json({
    files: filteredUploads,
    total: filteredUploads.length,
  });
};

// JSX Router Component
export const ContentRouter = () => (
  <router path="content">
    <use handler={authGuard}>
      <use handler={userBasedRateLimit}>
        
        {/* Article management */}
        <router path="articles">
          <get path="" handler={getAllArticles} />
          
          <get 
            path=":id" 
            validate={{ params: articleParamsSchema }}
            handler={getArticle} 
          />
          
          <post
            path=""
            validate={{ body: createArticleSchema }}
            handler={createArticle}
          />
          
          <put
            path=":id"
            validate={{ 
              params: articleParamsSchema,
              body: updateArticleSchema,
            }}
            handler={updateArticle}
          />
          
          <delete
            path=":id"
            validate={{ params: articleParamsSchema }}
            handler={deleteArticle}
          />
        </router>
        
        {/* Image upload with rate limiting */}
        <router path="images">
          <use handler={uploadRateLimit}>
            <use handler={validateFileUpload}>
              <post path="" handler={uploadImage} />
            </use>
          </use>
          
          <get path="" handler={getUploads} />
        </router>
        
      </use>
    </use>
  </router>
);

export { articles, uploadedFiles };
