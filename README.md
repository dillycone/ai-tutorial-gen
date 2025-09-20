# AI-Powered Video Tutorial Generator

An intelligent platform that transforms video content into structured tutorials and meeting summaries using Google Gemini AI, enhanced with DSPy 3 + GEPA automatic prompt optimization.

## 🎯 Overview

The AI Tutorial Generator captures key moments from videos, organizes them into structured knowledge, and exports polished walkthroughs or meeting notes. Whether you're documenting software workflows, creating educational content, or summarizing meetings, this tool streamlines the process with AI-powered intelligence.

### Key Features

- **🎙️ Transcript Alignment**: Upload caption files or auto-generate Gemini transcripts to surface searchable dialog snippets next to screenshots
- **✨ Key-Frame Suggestions**: Let Gemini suggest scene-change captures and batch add them to your shot list with one click
- **📹 Video Processing**: Upload videos and capture key screenshots at specific timestamps
- **🤖 AI Generation**: Convert visual content into structured tutorials or meeting summaries using Gemini AI
- **🧠 Smart Optimization**: DSPy 3 + GEPA automatically optimizes prompts for better output quality
- **📄 Professional PDF Export**: Advanced PDF generation with TOC, image compression, Unicode fonts, and interactive navigation
- **⚡ Real-time Progress**: Live updates during processing and optimization
- **🎛️ Flexible Configuration**: Multiple schema types and prompt strategies
- **📊 Performance Tracking**: Detailed metrics and optimization scores

## 🏗️ Architecture

### Frontend Stack
- **Framework**: Next.js 15.5.3 with App Router
- **Language**: TypeScript 5
- **UI Framework**: React 19.1.0
- **Styling**: TailwindCSS 4 + Radix UI components
- **State Management**: Custom React hooks
- **Icons**: Lucide React

### Backend & AI
- **AI Provider**: Google Gemini API (@google/genai)
- **Optimization**: DSPy 3 with GEPA (Generative Experience-driven Prompt Adaptation)
- **Document Generation**: PDF-lib for export functionality
- **Image Processing**: Sharp for compression and optimization
- **Validation**: Zod schemas for type safety

### Development Tools
- **Linting**: ESLint 9 with Next.js config
- **Type Checking**: TypeScript strict mode
- **Hot Reload**: Next.js fast refresh
- **Build System**: Next.js Turbopack (when available)

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm/yarn/pnpm
- **Python** 3.8+ (for DSPy optimization)
- **Google Gemini API Key** ([Get one here](https://ai.google.dev/))
- **Build tools** for Sharp image processing (automatically handled on most systems)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-tutorial-gen
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Install Python dependencies for DSPy**
   ```bash
   pip install -r python/requirements.txt
   ```

4. **Set up environment variables**
   ```bash
   cp .env.local.example .env.local
   ```

   Edit `.env.local` and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📖 Usage Guide

### Basic Workflow

1. **Upload Video**: Drag & drop or select a video file (MP4, WebM, etc.) then upload to Gemini storage
2. **Sync Transcripts** *(optional)*: Upload an SRT/VTT/JSON transcript or let Gemini auto-transcribe and search for key phrases
3. **Capture Screenshots**: Play the video and capture key moments manually or use **Suggest key frames** for AI-assisted captures
4. **Configure Options**: Choose schema type (Tutorial/Meeting Summary) and prompt strategy
5. **Generate Content**: Process screenshots (with transcript snippets) via Gemini to create structured output
6. **Export**: Customize export settings and download as formatted PDF or copy the generated text

### Video & Transcript Requirements

- **Video Formats**: MP4, WebM, AVI, MOV, MKV (up to ~750 MB Gemini upload limit)
- **Transcript Formats**: SRT (`.srt`), WebVTT (`.vtt`), JSON exports, or plain text summaries
- **Duration**: Works best with videos under 30 minutes
- **Quality**: Higher resolution provides better screenshot and transcript accuracy

### Schema Types

#### Tutorial Schema
Perfect for step-by-step guides and educational content:
- **Title**: Descriptive tutorial name
- **Overview**: Brief summary of what will be learned
- **Steps**: Numbered instructions with descriptions
- **Tips**: Additional helpful information
- **Troubleshooting**: Common issues and solutions

#### Meeting Summary Schema
Ideal for meeting recordings and discussions:
- **Meeting Title**: Purpose and context
- **Participants**: Key attendees (when visible)
- **Key Points**: Main discussion topics
- **Action Items**: Tasks and assignments
- **Next Steps**: Follow-up actions

### Transcript & Key-Frame Tools

#### Transcript Workbench
- Upload caption files or auto-generate via **Suggest transcript** (Gemini 1.5)
- Search across segments to jump the video player to matching dialog
- Linked transcript snippets are embedded into the generation payload for richer context

#### Key-Frame Suggestions
- Gemini analyzes the uploaded video and proposes scene-change captures
- Each suggestion is auto-labeled and flagged as **Suggested** in the screenshot grid
- Batch additions respect existing shots (deduped within ±0.5 s)

### Prompt Strategies

#### Manual Mode
- Uses hand-crafted prompts optimized for each schema type
- Consistent, predictable results
- Faster processing time
- Good baseline performance

#### DSPy + GEPA Mode
- Automatically optimizes prompts using machine learning
- Learns from successful generations
- Adapts to your specific content style
- Higher quality output over time
- Requires initial training period

### Export Settings

Configure PDF output options via the Settings button in the Result section:

#### Document Structure
- **Table of Contents**: Auto-generated clickable navigation with PDF bookmarks
- **Cover Page**: Professional title page with metadata (Beta)
- **Appendix**: Screenshot gallery for easy reference
- **URL Linkification**: Automatically detect and link URLs in text

#### Image Optimization
- **Compression**: Reduce file size by 60-80% using Sharp
- **Quality Control**: Adjust JPEG compression (60-95%)
- **Resolution Scaling**: Set maximum width for images (800-1920px)

#### Document Metadata
- **Custom Title**: Override generated title for footers and PDF properties
- **Author & Subject**: Add document metadata for organization
- **Keywords**: Enhance searchability and classification
- **Language**: Set document language for accessibility

#### Advanced Options
- **Page Layout**: Control section breaks and page numbering
- **Font Support**: Automatic Unicode text handling with Noto Sans fallback

## 🔧 Configuration

### Basic Settings

- **Schema Type**: Tutorial or Meeting Summary
- **Title Hint**: Optional context for better naming
- **Enforce Schema**: Strict JSON validation
- **Prompt Strategy**: Manual or DSPy optimization

### Architecture Improvements

Recent platform upgrades include:

- Transcript ingestion pipeline (parsing, validation, Gemini generation, prompt enrichment)
- Key-frame suggestion service and client workflow
- Screenshot metadata enhancements (transcript snippets, capture origin) feeding Gemini prompts

The codebase has been significantly refactored for better maintainability and performance:

#### Code Organization
- **Service Layer**: Business logic extracted from API routes (90%+ size reduction)
- **Hook Decomposition**: 855-line monolithic hook split into 6 focused hooks
- **Type Organization**: Consolidated into `/lib/types/` with domain separation
- **Component Extraction**: Large components broken down (e.g., ScreenshotCard)

#### Performance Optimizations
- **React.memo**: Components memoized with custom equality functions
- **useCallback/useMemo**: Strategic optimization of expensive operations
- **Lazy Loading**: Performance-critical components optimized
- **State Granularity**: Reduced re-renders through focused state management

#### Security & Validation
- **SSRF Protection**: URI validation prevents server-side request forgery
- **Type Safety**: Comprehensive request/response validation
- **Error Handling**: Structured logging system with AppError classes
- **Media Validation**: Strict content-type and URI checking

#### Developer Experience
- **Barrel Exports**: Cleaner imports with `/lib/types` and `/components/ui`
- **Code Reusability**: Hooks can be used independently
- **Testing**: Smaller, focused units easier to test
- **Debugging**: Enhanced error messages and structured logging

### Advanced DSPy Options

- **JSON Bonus Weight**: Adjusts preference for valid JSON (0-1)
- **Show Advanced Controls**: Access to expert settings
- **Promote Baseline**: Use successful prompts as defaults
- **Progressive Validation**: Smart subset optimization
- **Experience Database**: Learn from historical successes

### Environment Variables

```env
# Required
GEMINI_API_KEY=your_api_key

# Optional
ALLOWED_MEDIA_HOSTS=storage.googleapis.com,cdn.example.com
NEXT_PUBLIC_APP_ENV=development
DSPY_CACHE_TTL_HOURS=24
DSPY_MAX_TRAINSET_SIZE=50
```

## 🔌 API Reference

### POST /api/gemini/upload
Upload and process video files.

**Request:**
```typescript
FormData {
  video: File
}
```

**Response:**
```typescript
{
  success: boolean
  fileId: string
  metadata: {
    duration: number
    size: number
    type: string
  }
}
```

### POST /api/gemini/upload-images
Upload screenshot images for processing.

**Request:**
```typescript
FormData {
  images: File[]
  fileId: string
}
```

**Response:**
```typescript
{
  success: boolean
  imageIds: string[]
}
```

### POST /api/gemini/generate
Generate content from uploaded screenshots.

**Request:**
```typescript
{
  fileId: string
  imageIds: string[]
  schemaType: 'tutorial' | 'meetingSummary'
  promptMode: 'manual' | 'dspy'
  titleHint?: string
  enforceSchema: boolean
  dspyConfig?: {
    jsonBonus: number
    showAdvanced: boolean
    promoteBaseline: boolean
  }
}
```

**Response:**
```typescript
{
  success: boolean
  content: string
  metadata: {
    promptMode: string
    score?: number
    coverage?: number
    optimizationMeta: object
  }
}
```

### POST /api/gemini/export
Export generated content as PDF with comprehensive formatting and optimization options.

**Request:**
```typescript
{
  content: string
  title: string
  schemaType: string
  shots?: Array<{
    id: string
    timecode: string
    dataURL: string
    description?: string
  }>
  options?: {
    // Document Structure
    includeAppendix?: boolean      // Include screenshot appendix (default: true)
    includeTOC?: boolean          // Include Table of Contents (default: true)
    includeCover?: boolean        // Include cover page (default: false)
    linkifyUrls?: boolean         // Make URLs clickable (default: true)

    // Document Metadata
    runningTitle?: string         // Override document title
    author?: string              // PDF author metadata
    subject?: string             // PDF subject metadata
    keywords?: string[]          // PDF keywords for searchability
    language?: string            // Document language (default: "en")

    // Image Processing
    compressImages?: boolean     // Enable image compression (default: true)
    imageQuality?: number        // JPEG quality 0-1 (default: 0.82)
    imageMaxWidth?: number       // Max image width in pixels (default: 1280)
    imageMaxHeight?: number      // Max image height in pixels

    // Layout Options
    headingStartOnNewPage?: boolean  // Start sections on new pages
    pageNumberOffset?: number        // Offset for page numbering
  }
}
```

**Response:**
```typescript
Blob (PDF file)
// Headers:
// - Content-Disposition: attachment; filename="<sanitized-title>.pdf"
// - Content-Type: application/pdf
// - X-Export-Warnings: JSON array of any processing warnings
```

**Features:**
- **Image Compression**: Up to 80% file size reduction using Sharp
- **Unicode Support**: Full international text with Noto Sans fonts
- **Interactive Navigation**: Clickable Table of Contents with PDF bookmarks
- **URL Linkification**: Automatic detection and linking of URLs
- **Professional Layout**: Consistent typography and spacing
- **Accessibility**: Proper document structure and metadata
- **Error Recovery**: Lenient JSON parsing handles malformed LLM output

## 🧠 DSPy Integration

### GEPA Optimization System

The DSPy integration uses GEPA (Generative Experience-driven Prompt Adaptation) to automatically improve prompt quality:

#### Core Features

1. **Automatic Prompt Optimization**: Machine learning-driven improvement
2. **Schema-Specific Tuning**: Different strategies for tutorials vs meetings
3. **Performance Caching**: File-based LRU cache with 24-hour TTL
4. **Progressive Validation**: Smart subset selection for faster optimization
5. **Parallel Processing**: Concurrent prompt evaluation
6. **Experience Database**: Persistent storage of successful optimizations

#### Optimization Process

1. **Initial Training**: Uses successful examples to learn patterns
2. **Progressive Validation**: Starts with small subsets, grows confidence
3. **Parallel Evaluation**: Tests multiple prompt variations simultaneously
4. **Experience Learning**: Builds knowledge base for future use
5. **Baseline Promotion**: Automatically promotes high-scoring prompts

#### Performance Metrics

- **Score**: Overall prompt effectiveness (0-1)
- **Coverage**: Percentage of required fields generated
- **Confidence**: Statistical confidence in optimization
- **Cache Hit Rate**: Optimization reuse efficiency

### Configuration Files

The system uses several configuration approaches:

- **Frontend**: `lib/types.ts` for TypeScript definitions
- **Prompts**: `lib/geminiPrompts.ts` for manual prompt templates
- **DSPy Engine**: `python/dspy_optimize.py` for optimization logic
- **Caching**: `python/cache/` directory for optimization storage

## 🏗️ Development

### Project Structure

```
ai-tutorial-gen/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (refactored with service layer)
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components (performance optimized)
│   ├── ui/                # Reusable UI components
│   └── workbench/         # Main application components
├── hooks/                 # Custom React hooks (extracted from monolith)
│   ├── useVideoUpload.ts      # Video file handling and validation
│   ├── useScreenshotManager.ts # Screenshot capture and management
│   ├── useGenerationState.ts  # AI generation options and DSPy state
│   ├── useToast.ts            # Toast notification system
│   ├── useLocalStorage.ts     # SSR-safe localStorage management
│   └── useKeyboardShortcuts.ts # Keyboard event handling
├── lib/                   # Core utilities and services
│   ├── services/          # Business logic layer
│   │   ├── videoService.ts        # Video upload and processing
│   │   ├── generationService.ts   # AI generation with DSPy
│   │   └── exportService.ts       # PDF generation and export
│   ├── validators/        # Security and type validation
│   │   ├── mediaValidators.ts     # SSRF-safe URI validation
│   │   └── requestValidators.ts   # Type-safe request validation
│   ├── types/            # Organized type definitions
│   │   ├── api.ts             # API request/response types
│   │   └── domain.ts          # Business domain types
│   ├── errors.ts          # Enhanced error handling system
│   ├── gemini.ts          # Gemini AI client
│   ├── geminiPrompts.ts   # Prompt templates
│   ├── dspy.ts            # DSPy integration
│   └── types.ts           # TypeScript definitions (barrel export)
├── python/                # DSPy optimization system
│   ├── cache/             # Optimization cache
│   ├── dspy_optimize.py   # Main optimization script
│   └── requirements.txt   # Python dependencies
└── public/                # Static assets
```

### Key Components

#### Main Application Components
- **VideoWorkbench**: Main application interface (performance optimized)
- **UploadSection**: Video upload and preview
- **ScreenshotSection**: Screenshot capture and management
- **OptionsSection**: Configuration and settings
- **ResultSection**: Generated content display
- **ScreenshotCard**: Extracted card component (memoized)

#### Custom Hooks (Extracted Architecture)
- **useVideoWorkbench**: Orchestrating hook (refactored from 855-line monolith)
- **useVideoUpload**: Video file handling, validation, and Gemini upload
- **useScreenshotManager**: Screenshot capture, ordering, and management
- **useGenerationState**: AI generation options and DSPy configuration
- **useToast**: Toast notification system with queueing
- **useLocalStorage**: SSR-safe localStorage with TypeScript
- **useKeyboardShortcuts**: Keyboard event handling and shortcuts

#### Service Layer
- **videoService**: Video upload and screenshot processing logic
- **generationService**: AI generation with DSPy optimization
- **exportService**: PDF generation (extracted 700+ lines from API routes)

### State Management

The application uses a **modular hook composition pattern**, with `useVideoWorkbench` orchestrating multiple focused hooks:

```typescript
// Main orchestrating hook (refactored from 855-line monolith)
const {
  // Video management (delegated to useVideoUpload)
  videoFile, videoUrl, videoMetadata, handleVideoSelect,

  // Screenshot management (delegated to useScreenshotManager)
  shots, handleCaptureShot, handleRemoveShot, handleShotUpdate,

  // Generation state (delegated to useGenerationState)
  schemaType, promptMode, dspyConfig, titleHint,

  // Processing and results
  handleGenerate, resultText, busy, promptMeta,

  // Export functionality
  handleExportPdf,

  // Toast notifications (delegated to useToast)
  showToast, toasts
} = useVideoWorkbench();

// Individual focused hooks can also be used directly:
const uploadHook = useVideoUpload({ onSuccess: handleUploadComplete });
const screenshotHook = useScreenshotManager(videoRef, { maxShots: 10 });
const generationHook = useGenerationState();
```

#### Hook Composition Benefits
- **Single Responsibility**: Each hook handles one domain area
- **Reusability**: Hooks can be used independently in other components
- **Testability**: Smaller, focused units are easier to test
- **Performance**: Granular re-renders based on specific state changes
- **Maintainability**: 855-line monolith broken into 6 focused hooks

### Adding New Features

1. **New Schema Types**: Add to `lib/types.ts` and update prompts
2. **New Components**: Follow existing patterns in `components/`
3. **API Extensions**: Add routes in `app/api/`
4. **DSPy Enhancements**: Modify `python/dspy_optimize.py`

### Testing

```bash
# Run linting
npm run lint

# Type checking
npx tsc --noEmit

# Build verification
npm run build
```

## 🚀 Deployment

### Build Process

```bash
# Install dependencies
npm install
pip install -r python/requirements.txt

# Build application
npm run build

# Start production server
npm start
```

### Environment Setup

Ensure these environment variables are set in production:

```env
GEMINI_API_KEY=your_production_api_key
ALLOWED_MEDIA_HOSTS=your.domain.com,cdn.domain.com
NEXT_PUBLIC_APP_ENV=production
```

### Vercel Deployment

1. **Connect Repository**: Link your GitHub repository to Vercel
2. **Configure Environment**: Add `GEMINI_API_KEY` in Vercel dashboard
3. **Deploy**: Automatic deployment on git push
4. **Python Support**: Vercel automatically handles Python dependencies

### Docker Deployment

```dockerfile
FROM node:18-alpine

# Install Python for DSPy
RUN apk add --no-cache python3 py3-pip

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY python/requirements.txt python/
RUN pip install -r python/requirements.txt

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

### Performance Considerations

- **Video Processing**: Large videos may require increased memory limits
- **DSPy Optimization**: CPU-intensive operations benefit from multiple cores
- **Caching**: Ensure persistent storage for optimization cache
- **Rate Limiting**: Monitor Gemini API usage and implement throttling

## 🤝 Contributing

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Install dependencies: `npm install && pip install -r python/requirements.txt`
4. Make changes and test thoroughly
5. Commit with descriptive messages: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Style

- **TypeScript**: Strict mode enabled, follow existing patterns
- **React**: Functional components with hooks
- **Styling**: TailwindCSS utility classes
- **File Naming**: kebab-case for files, PascalCase for components
- **Imports**: Absolute imports using `@/` alias

### Pull Request Guidelines

1. **Description**: Clear explanation of changes and motivation
2. **Testing**: Verify functionality with different video types
3. **Documentation**: Update README if adding new features
4. **Code Quality**: Run `npm run lint` before submitting
5. **Screenshots**: Include UI changes in PR description

### Reporting Issues

When reporting bugs, please include:

- **Environment**: OS, Node.js version, browser
- **Steps to Reproduce**: Detailed reproduction steps
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Screenshots**: If applicable
- **Video Details**: File format, size, duration (if video-related)

### Feature Requests

For new features, consider:

- **Use Case**: Why is this feature needed?
- **Implementation**: How should it work?
- **Alternatives**: What workarounds exist?
- **Impact**: Who would benefit from this feature?

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Google Gemini AI** for powerful multimodal AI capabilities
- **DSPy Team** for the innovative prompt optimization framework
- **Next.js Team** for the excellent React framework
- **Vercel** for seamless deployment platform
- **Radix UI** for accessible component primitives

## 📞 Support

- **Documentation**: This README and inline code comments
- **Issues**: [GitHub Issues](issues) for bug reports and feature requests
- **Discussions**: [GitHub Discussions](discussions) for questions and ideas
- **API Support**: [Google Gemini Documentation](https://ai.google.dev/docs)

---

**Made with ❤️ for the developer community**