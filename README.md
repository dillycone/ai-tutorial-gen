# AI-Powered Video Tutorial Generator

An intelligent platform that transforms video content into structured tutorials and meeting summaries using Google Gemini AI, enhanced with DSPy 3 + GEPA automatic prompt optimization.

## 🎯 Overview

The AI Tutorial Generator captures key moments from videos, organizes them into structured knowledge, and exports polished walkthroughs or meeting notes. Whether you're documenting software workflows, creating educational content, or summarizing meetings, this tool streamlines the process with AI-powered intelligence.

### Key Features

- **📹 Video Processing**: Upload videos and capture key screenshots at specific timestamps
- **🤖 AI Generation**: Convert visual content into structured tutorials or meeting summaries using Gemini AI
- **🧠 Smart Optimization**: DSPy 3 + GEPA automatically optimizes prompts for better output quality
- **📄 Export Options**: Generate PDF documents with formatted content
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

1. **Upload Video**: Drag & drop or select a video file (MP4, WebM, etc.)
2. **Capture Screenshots**: Play the video and capture key moments with timestamps
3. **Configure Options**: Choose schema type (Tutorial/Meeting Summary) and prompt strategy
4. **Generate Content**: Process screenshots with AI to create structured output
5. **Export**: Download as formatted PDF or copy the generated text

### Video Requirements

- **Formats**: MP4, WebM, AVI, MOV, MKV
- **Size**: Recommended under 100MB for optimal performance
- **Duration**: Works best with videos under 30 minutes
- **Quality**: Higher resolution provides better screenshot analysis

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

## 🔧 Configuration

### Basic Settings

- **Schema Type**: Tutorial or Meeting Summary
- **Title Hint**: Optional context for better naming
- **Enforce Schema**: Strict JSON validation
- **Prompt Strategy**: Manual or DSPy optimization

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
Export generated content as PDF.

**Request:**
```typescript
{
  content: string
  title: string
  schemaType: string
}
```

**Response:**
```typescript
Blob (PDF file)
```

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
│   ├── api/               # API routes
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── ui/                # Reusable UI components
│   └── workbench/         # Main application components
├── hooks/                 # Custom React hooks
├── lib/                   # Utility functions
│   ├── gemini.ts          # Gemini AI client
│   ├── geminiPrompts.ts   # Prompt templates
│   ├── dspy.ts            # DSPy integration
│   └── types.ts           # TypeScript definitions
├── python/                # DSPy optimization system
│   ├── cache/             # Optimization cache
│   ├── dspy_optimize.py   # Main optimization script
│   └── requirements.txt   # Python dependencies
└── public/                # Static assets
```

### Key Components

- **VideoWorkbench**: Main application interface
- **UploadSection**: Video upload and preview
- **ScreenshotSection**: Screenshot capture and management
- **OptionsSection**: Configuration and settings
- **ResultSection**: Generated content display
- **useVideoWorkbench**: Central state management hook

### State Management

The application uses a centralized React hook (`useVideoWorkbench`) for state management:

```typescript
const {
  // Video state
  videoFile, videoUrl, videoMetadata,

  // Screenshot management
  shots, handleCaptureShot, handleRemoveShot,

  // Configuration
  schemaType, promptMode, dspyConfig,

  // Generation
  handleGenerate, resultText, busy,

  // Export
  handleExportPdf
} = useVideoWorkbench();
```

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