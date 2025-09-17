# DSPy GEPA Optimization System Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Complete Configuration Reference](#complete-configuration-reference)
4. [GEPA Auto Modes Guide](#gepa-auto-modes-guide)
5. [Experience Database Management](#experience-database-management)
6. [Advanced Optimization Strategies](#advanced-optimization-strategies)
7. [UI Controls and Configuration](#ui-controls-and-configuration)
8. [Performance Features](#performance-features)
9. [Technical Implementation](#technical-implementation)
10. [Production Deployment](#production-deployment)
11. [API Integration and Webhooks](#api-integration-and-webhooks)
12. [Advanced Debugging and Monitoring](#advanced-debugging-and-monitoring)
13. [Environment Variables Reference](#environment-variables-reference)
14. [Best Practices](#best-practices)
15. [Complete Troubleshooting Guide](#complete-troubleshooting-guide)
16. [Advanced Configuration](#advanced-configuration)

## System Overview

The DSPy GEPA optimization system in the AI Tutorial Generator application uses DSPy 3 with GEPA (Generative Experience-driven Prompt Adaptation) to automatically optimize Gemini system prompts for better performance in generating structured outputs from video content.

### Key Benefits
- **Automatic Prompt Optimization**: Uses machine learning to improve prompt quality over time
- **Schema-Specific Tuning**: Different optimization strategies for tutorials vs meeting summaries
- **Performance Optimization**: Caching, parallel processing, and progressive validation for faster results
- **Real-time Feedback**: Live progress updates and performance metrics
- **Experience Learning**: Builds a knowledge base of successful prompts for future use
- **Multi-Stage Optimization**: Progressive validation with confidence building
- **Production-Ready**: Comprehensive error handling, monitoring, and scaling support

### Core Components
1. **Configurable JSON Bonus** - Adjustable weight for JSON parsing success (0-1 slider)
2. **Weighted Feature Importance** - Schema-specific feature weights (Critical 2.0, Important 1.0, Optional 0.5)
3. **Optimization Result Caching** - File-based LRU cache with 24-hour TTL
4. **Progressive Validation** - Smart subset selection starting small, growing to full validation
5. **Parallel Evaluation** - Multiprocessing for concurrent prompt scoring
6. **Real-time Progress** - Shows validation size, confidence, stages, and cache status
7. **Experience Database** - Persistent storage and retrieval of successful optimizations
8. **Baseline Promotion** - Automatic promotion of high-scoring prompts to default configurations

## Architecture

### Frontend Components
- **OptionsSection.tsx**: Main configuration UI with advanced DSPy options
- **ResultSection.tsx**: Displays optimization results and progress
- **useVideoWorkbench.ts**: React hook managing application state

### Backend Components
- **lib/dspy.ts**: TypeScript interface to Python optimization system
- **python/dspy_optimize.py**: Core DSPy GEPA optimization engine
- **lib/geminiPrompts.ts**: Prompt configuration and override management
- **app/api/gemini/generate/route.ts**: Main API endpoint with DSPy integration
- **app/api/gemini/cache/route.ts**: Cache management API

### Data Flow
```
User Input → UI Configuration → API Request → Python DSPy Engine →
Optimization Results → Cache Storage → Experience Database → UI Updates
```

### Data Storage
```
data/prompt_overrides.json         # Baseline prompt configurations
python/cache/optimizer_cache.jsonl # Optimization result cache
python/experience/*.jsonl          # Experience database files
python/checkpoints/*.json          # Optimizer checkpoint files
```

## Complete Configuration Reference

### Core DSPy Options

#### Model Configuration
```typescript
type ModelConfig = {
  model?: string;                    // Primary optimization model (default: "gemini/gemini-2.5-flash")
  reflectionModel?: string;          // Reflection model for GEPA (default: same as model)
  temperature?: number;              // Sampling temperature 0-1 (default: 0.2)
  reflectionTemperature?: number;    // Reflection temperature (default: 0.7)
  maxTokens?: number;                // Max tokens per request (default: 32768)
  reflectionMaxTokens?: number;      // Max tokens for reflection (default: 32768)
  rpmLimit?: number;                 // Rate limit requests per minute (default: 8)
};
```

#### Optimization Control
```typescript
type OptimizationConfig = {
  auto?: "light" | "medium" | "heavy" | null;  // GEPA auto mode intensity
  maxMetricCalls?: number | null;              // Budget for optimization iterations (default: 600)
  seed?: number;                               // Random seed for reproducibility
  timeoutMs?: number;                          // Total optimization timeout (default: 90000)
  debug?: boolean;                             // Enable debug output
  initialInstructions?: string;                // Custom optimizer instructions
};
```

#### Scoring and Analysis
```typescript
type ScoringConfig = {
  jsonBonus?: number;                          // Bonus for valid JSON output 0-1 (default: 0.25)
  featureWeights?: Record<string, number>;     // Per-feature importance weights
};
```

#### Progressive Validation
```typescript
type ValidationConfig = {
  alwaysFullValidation?: boolean;              // Disable progressive validation (default: false)
  progressiveSchedule?: number[];              // Custom validation schedule [0.25, 0.5, 1.0]
};
```

#### Parallel Processing
```typescript
type ParallelConfig = {
  parallelEval?: boolean;                      // Enable parallel evaluation (default: false)
  parallelWorkers?: number;                    // Number of worker processes (default: 4)
  parallelBatchSize?: number;                  // Batch size per worker (default: 8)
  evalTimeoutMs?: number;                      // Evaluation timeout (default: 15000)
};
```

#### Experience Database
```typescript
type ExperienceConfig = {
  checkpointPath?: string;                     // Optimizer checkpoint file path
  experiencePath?: string;                     // Experience database file path
  experienceTopK?: number;                     // Max experiences to retrieve (default: 8)
  experienceMinScore?: number;                 // Minimum score threshold (default: 0.75)
  persistExperience?: boolean;                 // Save successful optimizations (default: true)
  experiencePruneThreshold?: number;           // Score threshold for pruning (default: 0.5)
  experienceMaxAge?: number;                   // Max age in days (default: 30)
};
```

### Complete Feature Weights Reference

#### Tutorial Schema Weights
```typescript
const tutorialWeights = {
  schemaFocus: 2.0,           // Adherence to tutorial structure
  grounding: 2.0,             // Factual accuracy from video
  screenshotCitation: 1.0,    // Proper screenshot ID references
  timecodeOrdering: 2.0,      // Chronological step ordering
  titleHint: 0.5,             // Respect for title suggestions
  formatWhenEnforced: 1.0,    // JSON structure when schema enforced
  formatWhenNotEnforced: 0.5, // Markdown structure when not enforced
  noScreenshotsBehavior: 0.5, // Handling cases without screenshots
};
```

#### Meeting Summary Schema Weights
```typescript
const meetingSummaryWeights = {
  schemaFocus: 2.0,           // Adherence to meeting summary structure
  grounding: 2.0,             // Factual accuracy from video
  screenshotCitation: 0.5,    // Screenshot references (less critical)
  timecodeOrdering: 0.5,      // Chronological ordering (less critical)
  titleHint: 0.5,             // Respect for meeting title hints
  formatWhenEnforced: 1.0,    // JSON structure when schema enforced
  formatWhenNotEnforced: 1.0, // Structured output when not enforced
  noScreenshotsBehavior: 0.5, // Handling cases without screenshots
};
```

#### Custom Weight Categories
```typescript
type WeightLevel = "critical" | "important" | "optional";
const weightValues: Record<WeightLevel, number> = {
  critical: 2.0,   // Essential features heavily impacting score
  important: 1.0,  // Significant features with moderate impact
  optional: 0.5,   // Nice-to-have features with minimal impact
};
```

## GEPA Auto Modes Guide

### Understanding GEPA Auto Modes

GEPA (Generative Experience-driven Prompt Adaptation) supports three automatic optimization intensity levels:

#### Light Mode (`auto: "light"`)
**Best for**: Quick iterations, development testing, resource-constrained environments
**Characteristics**:
- Fewer optimization iterations (typically 3-5 rounds)
- Smaller validation sets in early stages
- Faster convergence with acceptable quality
- Lower computational cost
- Suitable for frequent re-optimization

**Use Cases**:
```typescript
// Development and testing
const lightConfig = {
  auto: "light",
  maxMetricCalls: 200,
  progressiveSchedule: [0.5, 1.0],
  parallelEval: false,
};
```

**Performance Characteristics**:
- Optimization time: 1-3 minutes
- Resource usage: Low
- Quality: Good (75-85% of heavy mode quality)
- Best for: Rapid prototyping, CI/CD pipelines

#### Medium Mode (`auto: "medium"`)
**Best for**: Production use, balanced performance, most common scenarios
**Characteristics**:
- Moderate optimization depth (typically 5-8 rounds)
- Standard progressive validation schedule
- Good balance of quality and speed
- Recommended for most production deployments
- Reliable optimization results

**Use Cases**:
```typescript
// Standard production deployment
const mediumConfig = {
  auto: "medium",
  maxMetricCalls: 600,
  progressiveSchedule: [0.25, 0.5, 1.0],
  parallelEval: true,
  parallelWorkers: 4,
};
```

**Performance Characteristics**:
- Optimization time: 3-6 minutes
- Resource usage: Moderate
- Quality: Very good (90-95% of heavy mode quality)
- Best for: Production applications, regular optimization

#### Heavy Mode (`auto: "heavy"`)
**Best for**: Critical applications, maximum quality, research scenarios
**Characteristics**:
- Extensive optimization (typically 8-12+ rounds)
- Full validation sets throughout
- Maximum quality optimization
- Higher computational cost
- Best possible prompt quality

**Use Cases**:
```typescript
// High-stakes production or research
const heavyConfig = {
  auto: "heavy",
  maxMetricCalls: 1200,
  alwaysFullValidation: true,
  parallelEval: true,
  parallelWorkers: 8,
  parallelBatchSize: 16,
};
```

**Performance Characteristics**:
- Optimization time: 6-15 minutes
- Resource usage: High
- Quality: Maximum (100% quality baseline)
- Best for: Critical systems, research, benchmarking

#### Manual Mode (`auto: null`)
**Best for**: Custom optimization strategies, fine-grained control
**Characteristics**:
- No automatic parameter adjustment
- Full manual control over all settings
- Requires expertise to configure optimally
- Maximum flexibility

### Auto Mode Selection Guide

| Scenario | Recommended Mode | Rationale |
|----------|------------------|-----------|
| Development/Testing | Light | Fast feedback, frequent changes |
| Standard Production | Medium | Balanced quality and performance |
| Critical Applications | Heavy | Maximum quality required |
| Custom Workflows | Manual | Specific requirements |
| Resource Constrained | Light | Limited compute budget |
| High Volume | Light/Medium | Need to optimize many prompts |
| Research/Benchmarking | Heavy | Maximum quality comparison |
| CI/CD Integration | Light | Fast pipeline execution |
| One-time Optimization | Heavy | Best possible result |

### Auto Mode Configuration Matrix

```typescript
const autoModeConfigs = {
  light: {
    maxMetricCalls: 200,
    progressiveSchedule: [0.5, 1.0],
    parallelEval: false,
    experienceTopK: 3,
    timeout: 180000, // 3 minutes
  },
  medium: {
    maxMetricCalls: 600,
    progressiveSchedule: [0.25, 0.5, 1.0],
    parallelEval: true,
    parallelWorkers: 4,
    experienceTopK: 8,
    timeout: 360000, // 6 minutes
  },
  heavy: {
    maxMetricCalls: 1200,
    alwaysFullValidation: true,
    parallelEval: true,
    parallelWorkers: 8,
    parallelBatchSize: 16,
    experienceTopK: 15,
    timeout: 900000, // 15 minutes
  },
};
```

## Experience Database Management

### Database Structure and Storage

#### Experience Record Format
```json
{
  "id": "uuid-string",
  "ts": 1234567890.123,
  "usageCount": 5,
  "schemaType": "tutorial|meetingSummary",
  "context_summary": "Background and optimization context",
  "base_prompt": "Original prompt text",
  "optimization_brief": "List of optimization requirements",
  "expected_keywords": ["feature1", "feature2"],
  "raw": "Raw optimized prompt output",
  "persona": "Optimized persona text",
  "requirements": "Optimized requirements text",
  "requirementsList": ["req1", "req2"],
  "fallbackOutput": "Optimized fallback output",
  "fallbackOutputJson": {...},
  "styleGuide": "Optimized style guide",
  "parsed": true,
  "score": 0.85,
  "coverage": 0.92
}
```

#### Storage Location and Naming
```bash
# Default paths (schema-specific files)
python/experience/tutorial-episodes.jsonl
python/experience/meetingSummary-episodes.jsonl

# Custom path via environment
DSPY_EXPERIENCE_PATH="/custom/path/experiences.jsonl"

# File format: JSONL (JSON Lines)
# Each line is a complete JSON experience record
```

#### Database File Structure
```
python/experience/
├── tutorial-episodes.jsonl       # Tutorial-specific experiences
├── meetingSummary-episodes.jsonl # Meeting summary experiences
└── backup/                       # Automatic backups (optional)
    ├── tutorial-episodes-2024-01-15.jsonl
    └── meetingSummary-episodes-2024-01-15.jsonl
```

### Experience Retrieval Algorithm

#### Multi-Factor Similarity Scoring
```python
def calculate_experience_relevance(query_text: str, experience: dict) -> float:
    """
    Multi-factor scoring for experience retrieval:
    - Text similarity (70%): Cosine similarity on bag-of-words
    - Quality score (20%): Original optimization score
    - Recency bonus (10%): Age-based decay factor
    - Usage bonus: Small boost for frequently used experiences
    """
    # Text similarity calculation
    query_bow = extract_bow(query_text)
    exp_text = f"{experience['context_summary']} {experience['optimization_brief']}"
    exp_bow = extract_bow(exp_text)
    similarity = cosine_similarity(query_bow, exp_bow)  # 0-1

    # Quality and recency factors
    quality = experience["score"]  # 0-1
    age_seconds = current_time - experience["ts"]
    recency = 1.0 / max(1.0, age_seconds / 86400.0)  # Decay by days
    usage_bonus = min(0.1, 0.03 * log1p(experience["usageCount"]))

    # Weighted combination
    return (0.7 * similarity) + (0.2 * quality) + (0.1 * recency) + usage_bonus
```

#### Retrieval Configuration
```typescript
interface ExperienceRetrieval {
  experienceTopK: number;        // Max experiences to retrieve (default: 8)
  experienceMinScore: number;    // Minimum quality threshold (default: 0.75)
  schemaType: string;           // Must match current schema
  queryText: string;            // Combined context and requirements
}
```

#### Smart Retrieval Strategies
```typescript
// High-precision retrieval for specific cases
const precisionConfig = {
  experienceTopK: 3,
  experienceMinScore: 0.9,      // Only highest quality
  similarityThreshold: 0.8,     // High text similarity required
};

// Broad retrieval for diverse optimization
const diversityConfig = {
  experienceTopK: 15,
  experienceMinScore: 0.6,      // Include varied experiences
  similarityThreshold: 0.3,     // Lower similarity threshold
};

// Balanced retrieval for production
const balancedConfig = {
  experienceTopK: 8,
  experienceMinScore: 0.75,     // Good quality baseline
  similarityThreshold: 0.5,     // Moderate similarity
};
```

### Database Maintenance

#### Automatic Pruning
```python
def prune_experiences(
    path: str,
    prune_threshold: float = 0.5,  # Remove scores below this
    max_age_days: int = 30,        # Remove entries older than this
    max_entries: int = 1000,       # Keep only this many entries
    min_usage: int = 0             # Remove rarely used entries
) -> PruneStats:
    """
    Automatic cleanup based on:
    1. Quality threshold (score-based)
    2. Age limit (time-based)
    3. Size limit (LRU eviction)
    4. Usage patterns (activity-based)
    """
```

#### Pruning Strategies
```bash
# Conservative pruning (keep more data)
DSPY_EXPERIENCE_PRUNE_THRESHOLD=0.3
DSPY_EXPERIENCE_MAX_AGE_DAYS=90
DSPY_MAX_EXPERIENCE_ENTRIES=2000

# Aggressive pruning (save space)
DSPY_EXPERIENCE_PRUNE_THRESHOLD=0.7
DSPY_EXPERIENCE_MAX_AGE_DAYS=14
DSPY_MAX_EXPERIENCE_ENTRIES=500

# Balanced pruning (recommended)
DSPY_EXPERIENCE_PRUNE_THRESHOLD=0.5
DSPY_EXPERIENCE_MAX_AGE_DAYS=30
DSPY_MAX_EXPERIENCE_ENTRIES=1000
```

#### Manual Database Operations
```bash
# View database statistics
wc -l python/experience/*.jsonl

# Check score distribution
jq '.score' python/experience/tutorial-episodes.jsonl | sort -n | uniq -c

# Find highest quality experiences
jq 'select(.score >= 0.9)' python/experience/tutorial-episodes.jsonl

# Remove experiences older than 30 days
jq --argjson cutoff $(date -d '30 days ago' +%s) 'select(.ts >= $cutoff)' \
   python/experience/tutorial-episodes.jsonl > filtered.jsonl

# Reset usage counts
jq '.usageCount = 0' python/experience/tutorial-episodes.jsonl > reset.jsonl

# Export high-quality experiences for backup
jq 'select(.score >= 0.8)' python/experience/tutorial-episodes.jsonl > backup.jsonl
```

#### Experience Quality Metrics
```typescript
interface ExperienceQuality {
  averageScore: number;          // Mean score across all experiences
  scoreDistribution: {           // Score histogram
    excellent: number;           // >= 0.9
    good: number;               // 0.7-0.89
    fair: number;               // 0.5-0.69
    poor: number;               // < 0.5
  };
  usagePatterns: {
    mostUsed: Experience[];      // Top 10 by usage count
    unused: Experience[];        // Never retrieved (usageCount = 0)
    recent: Experience[];        // Added in last 7 days
  };
  ageAnalysis: {
    averageAge: number;          // Days since creation
    oldestEntry: number;         // Age of oldest experience
    recentActivity: number;      // Experiences added in last 7 days
  };
  sizeMetrics: {
    totalEntries: number;        // Total experience count
    totalSizeBytes: number;      // File size in bytes
    averageEntrySize: number;    // Average bytes per entry
  };
}
```

### Experience Database Optimization

#### Performance Tuning
```python
# Index-like optimization for large databases
def build_experience_index(experiences: List[Dict]) -> Dict[str, List[Dict]]:
    """
    Create in-memory indexes for faster retrieval:
    - Schema type index
    - Score range index
    - Keyword index
    - Time-based index
    """
    indexes = {
        'by_schema': defaultdict(list),
        'by_score_range': defaultdict(list),
        'by_keywords': defaultdict(list),
        'by_time_range': defaultdict(list),
    }

    for exp in experiences:
        # Schema index
        indexes['by_schema'][exp['schemaType']].append(exp)

        # Score range index
        score_range = int(exp['score'] * 10) / 10  # 0.1 precision
        indexes['by_score_range'][score_range].append(exp)

        # Keyword index
        for keyword in exp.get('expected_keywords', []):
            indexes['by_keywords'][keyword.lower()].append(exp)

    return indexes
```

#### Memory Management
```python
def optimize_experience_memory():
    """
    Memory optimization strategies:
    1. Lazy loading of experience data
    2. Compression of unused fields
    3. LRU cache for frequently accessed experiences
    4. Periodic garbage collection
    """
    # Implementation details...
```

## Advanced Optimization Strategies

### Multi-Stage Optimization Workflows

#### Incremental Optimization Strategy
```typescript
async function incrementalOptimization(config: OptimizationConfig) {
  // Stage 1: Quick exploration with light mode
  const stage1 = await optimizePrompt({
    ...config,
    auto: "light",
    maxMetricCalls: 150,
    progressiveSchedule: [0.5, 1.0],
  });

  // Stage 2: Refinement with medium mode if stage 1 shows promise
  if (stage1.analysis.score > 0.6) {
    const stage2 = await optimizePrompt({
      ...config,
      auto: "medium",
      maxMetricCalls: 400,
      checkpointPath: stage1.checkpointPath, // Resume from stage 1
    });

    // Stage 3: Final optimization with heavy mode for critical cases
    if (stage2.analysis.score > 0.8 && config.critical) {
      return optimizePrompt({
        ...config,
        auto: "heavy",
        maxMetricCalls: 800,
        checkpointPath: stage2.checkpointPath,
      });
    }

    return stage2;
  }

  return stage1;
}
```

#### Ensemble Optimization Strategy
```typescript
async function ensembleOptimization(config: OptimizationConfig) {
  // Run multiple optimizations with different random seeds
  const optimizations = await Promise.all([
    optimizePrompt({ ...config, seed: 1001 }),
    optimizePrompt({ ...config, seed: 2002 }),
    optimizePrompt({ ...config, seed: 3003 }),
  ]);

  // Select best result based on multiple criteria
  const bestOptimization = optimizations.reduce((best, current) => {
    const bestScore = best.analysis.score * best.analysis.coverage;
    const currentScore = current.analysis.score * current.analysis.coverage;
    return currentScore > bestScore ? current : best;
  });

  return bestOptimization;
}
```

#### Domain-Specific Optimization
```typescript
const domainStrategies = {
  // Technical tutorial optimization
  technical: {
    featureWeights: {
      timecodeOrdering: 2.0,
      screenshotCitation: 1.5,
      schemaFocus: 2.0,
      grounding: 1.5,
    },
    jsonBonus: 0.3,
    experienceTopK: 10,
  },

  // Business meeting optimization
  business: {
    featureWeights: {
      schemaFocus: 2.0,
      grounding: 2.0,
      formatWhenEnforced: 1.5,
      screenshotCitation: 0.3,
    },
    jsonBonus: 0.4,
    experienceTopK: 6,
  },

  // Creative content optimization
  creative: {
    featureWeights: {
      grounding: 1.5,
      formatWhenNotEnforced: 1.5,
      titleHint: 1.0,
      schemaFocus: 1.0,
    },
    jsonBonus: 0.2,
    experienceTopK: 12,
  },
};
```

### Advanced Metric Customization

#### Custom Scoring Functions
```python
def create_custom_metric(weights: Dict[str, float], bonus_functions: List[Callable]) -> Callable:
    """
    Create a custom scoring metric with:
    - Weighted feature importance
    - Custom bonus functions
    - Schema-specific adjustments
    - Content-aware scoring
    """
    def custom_metric(gold: dspy.Example, pred: dspy.Prediction) -> float:
        base_score = calculate_base_score(gold, pred, weights)

        # Apply custom bonus functions
        for bonus_func in bonus_functions:
            bonus = bonus_func(gold, pred)
            base_score = min(1.0, base_score + bonus)

        return base_score

    return custom_metric
```

#### Content-Aware Scoring
```python
def content_aware_bonus(gold: dspy.Example, pred: dspy.Prediction) -> float:
    """
    Bonus scoring based on content analysis:
    - Technical complexity detection
    - Visual content density
    - Temporal structure analysis
    """
    content = getattr(pred, "optimized_prompt", "")

    # Technical complexity bonus
    technical_terms = count_technical_terms(content)
    tech_bonus = min(0.1, technical_terms * 0.02)

    # Visual reference quality
    visual_refs = count_visual_references(content)
    visual_bonus = min(0.1, visual_refs * 0.03)

    # Structure coherence
    structure_score = analyze_structure_coherence(content)
    structure_bonus = structure_score * 0.05

    return tech_bonus + visual_bonus + structure_bonus
```

### Optimization Pipeline Design

#### Production Optimization Pipeline
```typescript
class OptimizationPipeline {
  async execute(config: PipelineConfig): Promise<OptimizationResult> {
    // 1. Pre-processing and validation
    const validatedConfig = await this.validateConfig(config);

    // 2. Experience retrieval and analysis
    const relevantExperiences = await this.retrieveExperiences(validatedConfig);

    // 3. Adaptive strategy selection
    const strategy = this.selectStrategy(validatedConfig, relevantExperiences);

    // 4. Multi-stage optimization execution
    const result = await this.executeStrategy(strategy);

    // 5. Post-processing and quality assurance
    const finalResult = await this.postProcess(result);

    // 6. Experience database update
    await this.updateExperiences(finalResult);

    return finalResult;
  }

  private selectStrategy(config: PipelineConfig, experiences: Experience[]): OptimizationStrategy {
    // Adaptive strategy selection based on:
    // - Available experiences
    // - Content complexity
    // - Performance requirements
    // - Resource constraints
  }
}
```

## UI Controls and Configuration

### Basic Options

#### Schema Type Selection
- **Tutorial**: Optimized for step-by-step instructional content
- **Meeting Summary**: Optimized for meeting notes and action items

#### Prompt Mode
- **Manual**: Use default prompts without optimization
- **DSPy**: Enable automatic prompt optimization

### Advanced DSPy Options

#### JSON Bonus Weight
**Location**: Advanced Options → DSPy Configuration
**Purpose**: Controls how much extra credit the optimizer gives for producing valid JSON output
**Range**: 0.0 - 1.0
**Default**: 0.25
**Usage**:
```typescript
// Stored in localStorage as "dspy.jsonBonus"
const jsonBonus = 0.25; // 25% bonus for valid JSON
```

**Recommendations**:
- **0.1-0.3**: For content where JSON structure is helpful but not critical
- **0.4-0.6**: For applications requiring structured output
- **0.7-1.0**: For strict JSON APIs (use cautiously as it may sacrifice content quality)

#### Feature Importance Matrix

**Location**: Advanced Options → Feature Weights
**Purpose**: Configure the relative importance of different prompt optimization criteria

**Categories**:

| Feature | Tutorial Default | Meeting Default | Description |
|---------|------------------|-----------------|-------------|
| Schema Focus | 2.0 (Critical) | 2.0 (Critical) | Adherence to output schema |
| Grounding | 2.0 (Critical) | 2.0 (Critical) | Factual accuracy based on input |
| Screenshot Citation | 1.0 (Important) | 0.5 (Optional) | References to visual elements |
| Timecode Ordering | 2.0 (Critical) | 0.5 (Optional) | Chronological step ordering |
| Title Hint | 0.5 (Optional) | 0.5 (Optional) | Use of provided title hints |
| Format When Enforced | 1.0 (Important) | 1.0 (Important) | Structure when schema enforcement is on |
| Format When Not Enforced | 0.5 (Optional) | 1.0 (Important) | Structure when schema enforcement is off |
| No Screenshots Behavior | 0.5 (Optional) | 0.5 (Optional) | Handling cases with no visual input |

**Weight Levels**:
- **Critical (2.0)**: Essential features that heavily impact optimization score
- **Important (1.0)**: Significant features with moderate impact
- **Optional (0.5)**: Nice-to-have features with minimal impact

**Configuration**:
```typescript
// Stored per schema type in localStorage
const storageKey = `dspy.featureWeights.${schemaType}`;
const weights = {
  schemaFocus: 2.0,
  grounding: 2.0,
  screenshotCitation: 1.0,
  // ... other weights
};
```

#### Validation Settings

##### Progressive Validation
**Purpose**: Start with small validation sets and gradually increase size for faster initial feedback
**Default**: Enabled
**Storage**: `localStorage["dspy.alwaysFullValidation"]`

**Progressive Schedule**:
- Stage 1: 25% of validation set
- Stage 2: 50% of validation set
- Stage 3: 100% of validation set

**Benefits**:
- Faster initial optimization
- Better user experience with progressive confidence building
- Resource-efficient for large datasets

##### Always Full Validation
**Purpose**: Disable progressive validation and always use the complete validation set
**Use Cases**:
- Final production optimizations
- When maximum accuracy is required
- Small datasets where progressive validation overhead isn't worth it

#### Parallel Processing

##### Enable Parallel Evaluation
**Default**: Disabled
**Storage**: `localStorage["dspy.parallel.enabled"]`
**Purpose**: Use multiprocessing for concurrent prompt evaluation

##### Worker Count
**Default**: 4
**Range**: 1-64
**Storage**: `localStorage["dspy.parallel.workers"]`
**Recommendation**: Set to number of CPU cores for optimal performance

##### Batch Size
**Default**: 8
**Range**: 1-64
**Storage**: `localStorage["dspy.parallel.batchSize"]`
**Purpose**: Number of prompts evaluated per worker batch

**Configuration Example**:
```typescript
const parallelConfig = {
  enabled: true,
  workers: 4,
  batchSize: 8
};
```

#### Cache Management

##### Cache Statistics
**Location**: Advanced Options → DSPy Cache
**Displays**:
- Cache hit rate percentage
- Total cache size (formatted in B/KB/MB/GB)
- Number of cached entries
- Cache performance metrics

##### Clear Cache
**Purpose**: Force cache refresh for new optimization runs
**Use Cases**:
- After updating prompt configurations
- When experiencing stale optimization results
- Performance troubleshooting

**API Endpoint**: `GET/DELETE /api/gemini/cache`

#### Baseline Promotion
**Purpose**: Automatically promote successful optimized prompts to become the new baseline
**Default**: Disabled
**Storage**: Component state (not persisted)
**Effect**: Updates `data/prompt_overrides.json` with optimized prompt configurations

## Performance Features

### Caching System

#### Cache Key Generation
```python
def _build_cache_key(payload: Dict[str, Any]) -> str:
    # Creates hash from:
    # - Schema type
    # - Feature weights
    # - JSON bonus settings
    # - Prompt blueprint
    # - Shot summaries
    # - Model configurations
    # - All optimization parameters
```

#### Cache TTL (Time To Live)
- **Default**: 24 hours (86,400 seconds)
- **Purpose**: Balance between performance and freshness
- **Eviction**: LRU (Least Recently Used) policy

#### Cache Performance Indicators
- **Hit Rate**: Percentage of requests served from cache
- **Cache Size**: Total storage used by cached results
- **Age Tracking**: How long cached entries have been stored

### Progressive Validation

#### Subset Selection Algorithm
```python
def _select_validation_subset(trainset, extras, fraction, rng):
    # Intelligent subset selection:
    # 1. Ensure minimum examples per category
    # 2. Maintain representative distribution
    # 3. Use consistent random seeding for reproducibility
    # 4. Prioritize request example and retrieved experiences
    # 5. Diversify foundation examples
```

#### Confidence Calculation
```python
confidence = min(1.0, (validation_size / max(1, validation_total)) * coverage_factor)
```

#### Stage Progression
- **Stage 1**: 25% validation, fast feedback
- **Stage 2**: 50% validation, intermediate confidence
- **Stage 3**: 100% validation, final optimization

### Parallel Processing

#### Worker Pool Management
```python
def _parallel_evaluate_prompt(raw_text, feature_sets, json_bonus,
                             feature_weights, workers, batch_size, timeout_s):
    # Creates worker pool with specified size
    # Distributes evaluation tasks across workers
    # Handles timeouts and resource cleanup
```

#### Resource Management
- Automatic worker cleanup after optimization
- Memory management with garbage collection
- Process isolation for stability

#### Performance Monitoring
- Worker utilization tracking
- Batch processing efficiency
- Timeout handling and recovery

## Technical Implementation

### Experience Database

#### Storage Format
```python
{
    "id": "unique_identifier",
    "ts": timestamp_float,
    "usageCount": 5,
    "schemaType": "tutorial|meetingSummary",
    "context_summary": "text_summary_of_input",
    "base_prompt": "original_prompt_text",
    "optimization_brief": "list_of_requirements",
    "expected_keywords": ["feature1", "feature2"],
    "raw": "raw_optimized_output",
    "persona": "optimized_persona",
    "requirements": "optimized_requirements",
    "requirementsList": ["req1", "req2"],
    "fallbackOutput": "optimized_fallback",
    "fallbackOutputJson": {...},
    "styleGuide": "optimized_style",
    "parsed": true,
    "score": 0.85,
    "coverage": 0.92
}
```

#### Retrieval Algorithm
1. **Text Similarity**: Cosine similarity between input summaries
2. **Schema Matching**: Filter by schema type
3. **Score Threshold**: Minimum quality threshold (configurable)
4. **Top-K Selection**: Return best matching experiences
5. **Usage Tracking**: Increment usage counts for retrieved experiences

#### Experience Pruning
- **Age-based**: Remove entries older than configurable days
- **Usage-based**: Remove rarely used entries (usage_count < threshold)
- **Size-based**: Maintain maximum database size
- **Quality-based**: Remove low-scoring experiences

### Prompt Configuration

#### Schema Configuration Structure
```typescript
interface SchemaConfig {
  persona: string;           // AI assistant persona
  requirements: string;      // Output requirements
  fallbackOutput: string;    // Default output on failure
  schema: unknown;          // JSON schema for validation
  hintLabel: string;        // UI hint text
  styleGuide?: string;       // Style guidelines
}
```

#### Override System
```json
// data/prompt_overrides.json
{
  "tutorial": {
    "persona": "optimized persona text...",
    "requirements": "optimized requirements...",
    "fallbackOutput": "optimized fallback...",
    "styleGuide": "optimized style...",
    "score": 0.89,
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "meetingSummary": {
    // ... schema-specific overrides
  }
}
```

#### Baseline Promotion Process
1. Optimization completes successfully
2. User enables "Promote Baseline" option
3. System validates optimization quality (score threshold)
4. System updates `prompt_overrides.json`
5. New baseline becomes default for future requests

### Optimization Metrics

#### Scoring Algorithm
```python
def metric(gold: dspy.Example, pred: dspy.Prediction) -> float:
    # Multi-factor scoring:
    # 1. Feature satisfaction (weighted by importance)
    # 2. JSON parsing bonus (if applicable)
    # 3. Content quality assessment
    # 4. Schema compliance
    # 5. Confidence adjustment based on validation stage
    return weighted_score
```

#### Feature Analysis
```python
def _build_features(payload):
    # Extracts optimization features:
    # - Schema compliance requirements
    # - Content structure expectations
    # - Format specifications
    # - Quality criteria
    # - Shot-specific requirements
    return features_list, weights_map
```

## Production Deployment

### Deployment Architecture

#### Recommended Infrastructure
```yaml
# Production deployment architecture
services:
  frontend:
    image: ai-tutorial-gen:frontend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DSPY_TIMEOUT_MS=120000

  backend:
    image: ai-tutorial-gen:backend
    ports:
      - "8000:8000"
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - DSPY_CACHE_PATH=/data/cache
      - DSPY_EXPERIENCE_PATH=/data/experience
    volumes:
      - dspy_data:/data

  cache:
    image: redis:alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  dspy_data:
  redis_data:
```

#### Scaling Considerations
```typescript
interface ScalingConfig {
  // Horizontal scaling
  instances: number;              // Number of backend instances
  loadBalancer: "round-robin" | "least-connections";

  // Vertical scaling
  cpuCores: number;              // CPU allocation per instance
  memoryGB: number;              // Memory allocation per instance

  // DSPy-specific scaling
  maxConcurrentOptimizations: number;  // Limit concurrent optimizations
  workerPoolSize: number;             // Workers per optimization
  cacheSharding: boolean;             // Distribute cache across instances
}
```

### Performance Optimization for Production

#### Resource Management
```python
# Production resource limits
PRODUCTION_LIMITS = {
    "max_concurrent_optimizations": 3,
    "max_workers_per_optimization": 4,
    "max_memory_per_worker": "512MB",
    "optimization_timeout": 300,  # 5 minutes
    "cache_max_size": "1GB",
    "experience_max_entries": 5000,
}
```

#### Monitoring and Metrics
```typescript
interface ProductionMetrics {
  optimization: {
    requestsPerMinute: number;
    averageOptimizationTime: number;
    successRate: number;
    cacheHitRate: number;
  };
  performance: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    activeWorkers: number;
  };
  quality: {
    averageScore: number;
    scoreDistribution: number[];
    experienceQuality: number;
  };
}
```

#### Health Checks and Monitoring
```bash
# Health check endpoints
GET /api/health                    # Basic health check
GET /api/health/dspy               # DSPy system health
GET /api/health/cache              # Cache system health
GET /api/health/experience         # Experience database health

# Monitoring integration
curl -X POST http://monitoring-service/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "service": "dspy-optimization",
    "metrics": {
      "optimization_time": 245.6,
      "cache_hit_rate": 0.73,
      "experience_retrievals": 8
    }
  }'
```

### Security Considerations

#### API Security
```typescript
// Rate limiting configuration
const rateLimits = {
  optimization: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 10,                   // Max 10 optimizations per window
  },
  cache: {
    windowMs: 60 * 1000,       // 1 minute
    max: 100,                  // Max 100 cache operations per minute
  },
};

// Authentication and authorization
interface SecurityConfig {
  apiKey: string;              // Required API key
  allowedOrigins: string[];    // CORS configuration
  maxRequestSize: string;      // Request size limits
  enableAuditLog: boolean;     // Audit trail
}
```

#### Data Protection
```bash
# Environment variables for production
GEMINI_API_KEY=<encrypted-api-key>
DSPY_CACHE_ENCRYPTION=true
DSPY_EXPERIENCE_ENCRYPTION=true
AUDIT_LOG_LEVEL=info
SECURE_HEADERS=true
```

## API Integration and Webhooks

### REST API Endpoints

#### Core Optimization API
```typescript
// Primary optimization endpoint
POST /api/gemini/generate
{
  "video": { "uri": "gs://...", "mimeType": "video/mp4" },
  "screenshots": [
    { "id": "s1", "uri": "gs://...", "mimeType": "image/png", "timecode": "00:30" }
  ],
  "schemaType": "tutorial",
  "enforceSchema": true,
  "promptMode": "dspy",
  "dspyOptions": {
    "auto": "medium",
    "jsonBonus": 0.25,
    "featureWeights": { "schemaFocus": 2.0 },
    "parallelEval": true
  }
}

// Response
{
  "rawText": "Generated output...",
  "promptMeta": {
    "appliedMode": "dspy",
    "score": 0.87,
    "coverage": 0.92,
    "cacheHit": false,
    "retrievedFromExperience": 3
  },
  "appliedPrompt": {
    "persona": "Optimized persona...",
    "requirements": "Optimized requirements..."
  }
}
```

#### Cache Management API
```typescript
// Cache statistics
GET /api/gemini/cache
{
  "entries": 42,
  "sizeBytes": 1048576,
  "ttlSeconds": 86400,
  "maxEntries": 100,
  "hitRate": 0.73
}

// Clear cache
DELETE /api/gemini/cache
{
  "ok": true,
  "cleared": true,
  "entriesRemoved": 42
}
```

#### Experience Database API
```typescript
// Get experience statistics
GET /api/dspy/experience/stats
{
  "totalExperiences": 156,
  "averageScore": 0.78,
  "schemaDistribution": {
    "tutorial": 89,
    "meetingSummary": 67
  },
  "qualityMetrics": {
    "excellent": 23,  // >= 0.9
    "good": 78,       // 0.7-0.89
    "fair": 45,       // 0.5-0.69
    "poor": 10        // < 0.5
  }
}

// Export experiences for backup
GET /api/dspy/experience/export?schema=tutorial&minScore=0.8
[
  { "id": "...", "score": 0.89, "schemaType": "tutorial", ... },
  ...
]

// Import experiences from backup
POST /api/dspy/experience/import
{
  "experiences": [...],
  "overwrite": false
}
```

### Webhook Integration

#### Progress Webhooks
```typescript
// Real-time optimization progress
interface ProgressWebhook {
  url: string;
  events: ("start" | "progress" | "complete" | "error")[];
  headers?: Record<string, string>;
  retryConfig?: {
    maxRetries: number;
    backoffMs: number;
  };
}

// Webhook payload
{
  "event": "progress",
  "sessionId": "opt-session-123",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "iteration": 5,
    "score": 0.82,
    "coverage": 0.89,
    "stage": 2,
    "stages": 3,
    "message": "Optimization progressing..."
  }
}
```

#### Integration Examples
```javascript
// Express.js webhook handler
app.post('/webhook/dspy-progress', (req, res) => {
  const { event, sessionId, data } = req.body;

  switch (event) {
    case 'start':
      console.log(`Optimization started: ${sessionId}`);
      break;
    case 'progress':
      updateOptimizationUI(sessionId, data);
      break;
    case 'complete':
      handleOptimizationComplete(sessionId, data);
      break;
    case 'error':
      handleOptimizationError(sessionId, data);
      break;
  }

  res.status(200).json({ received: true });
});

// React component for real-time updates
function OptimizationMonitor({ sessionId }) {
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    const eventSource = new EventSource(`/api/dspy/progress/${sessionId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data);
    };

    return () => eventSource.close();
  }, [sessionId]);

  return (
    <div>
      {progress && (
        <div>
          <div>Stage: {progress.stage}/{progress.stages}</div>
          <div>Score: {(progress.score * 100).toFixed(1)}%</div>
          <div>Coverage: {(progress.coverage * 100).toFixed(1)}%</div>
        </div>
      )}
    </div>
  );
}
```

### External System Integration

#### Batch Processing API
```typescript
// Batch optimization for multiple inputs
POST /api/dspy/batch
{
  "jobs": [
    {
      "id": "job-1",
      "input": { /* optimization payload */ },
      "priority": "high"
    },
    {
      "id": "job-2",
      "input": { /* optimization payload */ },
      "priority": "normal"
    }
  ],
  "webhookUrl": "https://your-service.com/webhook",
  "batchConfig": {
    "maxConcurrent": 2,
    "timeoutMs": 600000
  }
}

// Response
{
  "batchId": "batch-789",
  "totalJobs": 2,
  "estimatedCompletionTime": "2024-01-15T10:45:00.000Z"
}
```

#### CI/CD Integration
```yaml
# GitHub Actions example
name: Optimize Prompts
on:
  push:
    paths: ['prompts/**']

jobs:
  optimize:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Optimize Tutorial Prompts
        run: |
          curl -X POST "$DSPY_API_URL/api/dspy/batch" \
            -H "Authorization: Bearer $DSPY_API_KEY" \
            -H "Content-Type: application/json" \
            -d @prompts/optimization-batch.json
        env:
          DSPY_API_URL: ${{ secrets.DSPY_API_URL }}
          DSPY_API_KEY: ${{ secrets.DSPY_API_KEY }}
```

## Advanced Debugging and Monitoring

### Comprehensive Logging System

#### Log Levels and Categories
```python
import logging
from enum import Enum

class LogCategory(Enum):
    OPTIMIZATION = "optimization"
    CACHE = "cache"
    EXPERIENCE = "experience"
    PARALLEL = "parallel"
    VALIDATION = "validation"
    PERFORMANCE = "performance"

# Structured logging configuration
LOGGING_CONFIG = {
    "version": 1,
    "formatters": {
        "detailed": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S"
        },
        "json": {
            "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "format": "%(asctime)s %(name)s %(levelname)s %(message)s"
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "detailed",
            "level": "INFO"
        },
        "file": {
            "class": "logging.FileHandler",
            "filename": "dspy_optimization.log",
            "formatter": "json",
            "level": "DEBUG"
        }
    },
    "loggers": {
        "dspy.optimization": {"level": "DEBUG", "handlers": ["console", "file"]},
        "dspy.cache": {"level": "INFO", "handlers": ["file"]},
        "dspy.experience": {"level": "INFO", "handlers": ["file"]},
        "dspy.parallel": {"level": "WARNING", "handlers": ["console", "file"]},
    }
}
```

#### Performance Profiling
```python
import time
import psutil
from contextlib import contextmanager

@contextmanager
def performance_monitor(operation_name: str):
    """Context manager for detailed performance monitoring."""
    start_time = time.time()
    start_memory = psutil.virtual_memory().used
    start_cpu = psutil.cpu_percent()

    try:
        yield
    finally:
        end_time = time.time()
        end_memory = psutil.virtual_memory().used
        end_cpu = psutil.cpu_percent()

        metrics = {
            "operation": operation_name,
            "duration_ms": (end_time - start_time) * 1000,
            "memory_delta_mb": (end_memory - start_memory) / 1024 / 1024,
            "cpu_usage_avg": (start_cpu + end_cpu) / 2,
            "timestamp": time.time()
        }

        logger.info("Performance metrics", extra=metrics)

# Usage example
with performance_monitor("dspy_optimization"):
    result = optimize_prompt_with_dspy(payload)
```

### Debug Configuration Options

#### Debug Mode Settings
```typescript
interface DebugConfig {
  enabled: boolean;
  verboseLogging: boolean;
  saveIntermediateResults: boolean;
  profilePerformance: boolean;
  traceExecution: boolean;
  debugOutputPath: string;
}

// Environment variable configuration
const debugConfig: DebugConfig = {
  enabled: process.env.DSPY_DEBUG === "true",
  verboseLogging: process.env.DSPY_VERBOSE === "true",
  saveIntermediateResults: process.env.DSPY_SAVE_INTERMEDIATE === "true",
  profilePerformance: process.env.DSPY_PROFILE === "true",
  traceExecution: process.env.DSPY_TRACE === "true",
  debugOutputPath: process.env.DSPY_DEBUG_PATH || "./debug"
};
```

#### Execution Tracing
```python
def trace_optimization_execution(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Comprehensive execution tracing for optimization debugging."""
    trace_id = str(uuid4())
    trace_data = {
        "trace_id": trace_id,
        "start_time": time.time(),
        "payload_hash": hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest(),
        "stages": []
    }

    try:
        # Stage 1: Preprocessing
        stage_start = time.time()
        trainset, context, base_prompt, features, extras = _build_trainset(payload)
        trace_data["stages"].append({
            "name": "preprocessing",
            "duration_ms": (time.time() - stage_start) * 1000,
            "trainset_size": len(trainset),
            "features_count": len(features),
            "retrieved_experiences": extras.get("retrievedCount", 0)
        })

        # Stage 2: Optimization
        stage_start = time.time()
        # ... optimization code ...
        trace_data["stages"].append({
            "name": "optimization",
            "duration_ms": (time.time() - stage_start) * 1000,
            "iterations": optimization_iterations,
            "final_score": final_score
        })

        # Save trace data for debugging
        if os.environ.get("DSPY_SAVE_TRACES") == "true":
            trace_path = f"debug/traces/trace_{trace_id}.json"
            os.makedirs(os.path.dirname(trace_path), exist_ok=True)
            with open(trace_path, "w") as f:
                json.dump(trace_data, f, indent=2)

        return result

    except Exception as e:
        trace_data["error"] = str(e)
        trace_data["error_type"] = type(e).__name__
        raise
    finally:
        trace_data["total_duration_ms"] = (time.time() - trace_data["start_time"]) * 1000
        logger.debug("Optimization trace", extra=trace_data)
```

### Real-time Monitoring Dashboard

#### Metrics Collection
```typescript
interface OptimizationMetrics {
  // Performance metrics
  requestsPerMinute: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  successRate: number;
  errorRate: number;

  // Cache metrics
  cacheHitRate: number;
  cacheSize: number;
  cacheEvictions: number;

  // Experience metrics
  experienceRetrievals: number;
  experienceHitRate: number;
  experienceQuality: number;

  // Resource metrics
  cpuUsage: number;
  memoryUsage: number;
  activeWorkers: number;
  queueDepth: number;
}

class MetricsCollector {
  private metrics: OptimizationMetrics = this.initializeMetrics();

  recordOptimization(duration: number, success: boolean, cacheHit: boolean) {
    // Update performance metrics
    this.metrics.requestsPerMinute++;
    this.updateResponseTime(duration);
    if (success) this.metrics.successRate++;
    else this.metrics.errorRate++;
    if (cacheHit) this.metrics.cacheHitRate++;
  }

  async exportMetrics(): Promise<OptimizationMetrics> {
    // Add real-time system metrics
    this.metrics.cpuUsage = await this.getCpuUsage();
    this.metrics.memoryUsage = await this.getMemoryUsage();
    this.metrics.activeWorkers = await this.getActiveWorkers();

    return { ...this.metrics };
  }
}
```

#### Alert System
```typescript
interface AlertConfig {
  thresholds: {
    responseTime: number;      // Alert if > 5000ms
    errorRate: number;         // Alert if > 0.1 (10%)
    cacheHitRate: number;      // Alert if < 0.5 (50%)
    memoryUsage: number;       // Alert if > 0.8 (80%)
  };
  notifications: {
    email?: string[];
    webhook?: string;
    slack?: string;
  };
}

class AlertManager {
  checkAlerts(metrics: OptimizationMetrics, config: AlertConfig) {
    const alerts: Alert[] = [];

    if (metrics.p95ResponseTime > config.thresholds.responseTime) {
      alerts.push({
        type: "performance",
        severity: "warning",
        message: `Response time exceeded threshold: ${metrics.p95ResponseTime}ms`,
        timestamp: new Date().toISOString()
      });
    }

    if (metrics.errorRate > config.thresholds.errorRate) {
      alerts.push({
        type: "reliability",
        severity: "error",
        message: `Error rate exceeded threshold: ${(metrics.errorRate * 100).toFixed(1)}%`,
        timestamp: new Date().toISOString()
      });
    }

    return alerts;
  }
}
```

### Interactive Debugging Tools

#### Debug Console Interface
```typescript
// Interactive debugging commands
interface DebugCommands {
  // Optimization debugging
  "opt:trace": (sessionId: string) => OptimizationTrace;
  "opt:replay": (traceId: string) => OptimizationResult;
  "opt:analyze": (sessionId: string) => PerformanceAnalysis;

  // Cache debugging
  "cache:inspect": (key?: string) => CacheEntry[];
  "cache:stats": () => CacheStatistics;
  "cache:clear": (pattern?: string) => number;

  // Experience debugging
  "exp:search": (query: string, schema: string) => Experience[];
  "exp:quality": (schema?: string) => QualityReport;
  "exp:prune": (options: PruneOptions) => PruneResult;

  // System debugging
  "sys:health": () => SystemHealth;
  "sys:resources": () => ResourceUsage;
  "sys:logs": (level: string, limit: number) => LogEntry[];
}

// Web-based debug console
class DebugConsole {
  async executeCommand(command: string, args: string[]): Promise<any> {
    const [category, action] = command.split(":");

    switch (category) {
      case "opt":
        return this.handleOptimizationCommand(action, args);
      case "cache":
        return this.handleCacheCommand(action, args);
      case "exp":
        return this.handleExperienceCommand(action, args);
      case "sys":
        return this.handleSystemCommand(action, args);
      default:
        throw new Error(`Unknown command category: ${category}`);
    }
  }
}
```

## Environment Variables Reference

### Core Configuration Variables

#### Python Environment
```bash
# Python interpreter and dependencies
DSPY_PYTHON="/usr/bin/python3"              # Python executable path
PYTHONPATH="/app/.python_lib:/app/python"   # Python module search path

# API Configuration
GEMINI_API_KEY="your-gemini-api-key"        # Required: Gemini API key
DSPY_MODEL="gemini/gemini-2.5-flash"       # Default optimization model
DSPY_REFLECTION_MODEL="gemini/gemini-2.5-flash"  # Reflection model for GEPA
DSPY_RPM_LIMIT="8"                         # Rate limit (requests per minute)
```

#### Optimization Configuration
```bash
# Timeout and Performance
DSPY_TIMEOUT_MS="90000"                    # Total optimization timeout (90 seconds)
DSPY_EVAL_TIMEOUT_MS="15000"               # Evaluation timeout (15 seconds)
DSPY_MAX_ITERATIONS="10"                   # Maximum optimization iterations
DSPY_CONVERGENCE_THRESHOLD="0.01"          # Convergence threshold

# Progressive Validation
DSPY_PROGRESSIVE_SCHEDULE="0.25,0.5,1.0"   # Validation schedule (comma-separated)
DSPY_ALWAYS_FULL_VALIDATION="false"        # Disable progressive validation
DSPY_MIN_VALIDATION_SIZE="5"               # Minimum validation set size

# Parallel Processing
DSPY_PARALLEL="true"                       # Enable parallel evaluation
DSPY_PARALLEL_WORKERS="4"                  # Number of worker processes
DSPY_PARALLEL_BATCH_SIZE="8"               # Batch size per worker
DSPY_MAX_WORKERS="8"                       # Maximum worker processes
DSPY_WORKER_TIMEOUT="30"                   # Worker timeout (seconds)
```

#### Caching Configuration
```bash
# Cache Settings
DSPY_CACHE_PATH="/app/python/cache/optimizer_cache.jsonl"  # Cache file path
DSPY_CACHE_TTL_SECONDS="86400"             # Cache TTL (24 hours)
DSPY_CACHE_MAX="100"                       # Maximum cache entries
DSPY_CACHE_ENCRYPTION="false"              # Enable cache encryption
```

#### Experience Database Configuration
```bash
# Experience Database
DSPY_EXPERIENCE_PATH="/app/python/experience"              # Experience database directory
DSPY_EXPERIENCE_TOP_K="8"                  # Max experiences to retrieve
DSPY_EXPERIENCE_MIN_SCORE="0.75"           # Minimum score threshold
DSPY_EXPERIENCE_PERSIST="true"             # Save successful optimizations
DSPY_EXPERIENCE_MAX_AGE_DAYS="30"          # Maximum age (days)
DSPY_EXPERIENCE_PRUNE_THRESHOLD="0.5"      # Pruning score threshold
DSPY_MAX_EXPERIENCE_ENTRIES="1000"         # Maximum database entries
```

#### Debug and Monitoring
```bash
# Debug Configuration
DSPY_DEBUG="false"                         # Enable debug mode
DSPY_VERBOSE="false"                       # Verbose logging
DSPY_TRACE="false"                         # Enable execution tracing
DSPY_PROFILE="false"                       # Enable performance profiling
DSPY_SAVE_INTERMEDIATE="false"             # Save intermediate results
DSPY_DEBUG_PATH="/app/debug"               # Debug output directory
DSPY_SAVE_TRACES="false"                   # Save execution traces

# Logging
LOG_LEVEL="INFO"                           # Logging level (DEBUG, INFO, WARNING, ERROR)
LOG_FORMAT="json"                          # Log format (json, text)
LOG_FILE="/app/logs/dspy.log"              # Log file path
```

### Production Environment Variables

#### Security and Authentication
```bash
# Security Settings
API_KEY_REQUIRED="true"                    # Require API key authentication
ALLOWED_ORIGINS="https://yourdomain.com"   # CORS allowed origins
MAX_REQUEST_SIZE="50MB"                    # Maximum request size
RATE_LIMIT_ENABLED="true"                  # Enable rate limiting
AUDIT_LOG_ENABLED="true"                   # Enable audit logging

# Encryption
CACHE_ENCRYPTION_KEY="your-encryption-key" # Cache encryption key
EXPERIENCE_ENCRYPTION_KEY="your-exp-key"   # Experience database encryption key
```

#### Performance and Scaling
```bash
# Resource Limits
MAX_CONCURRENT_OPTIMIZATIONS="3"          # Limit concurrent optimizations
MAX_MEMORY_PER_WORKER="512MB"              # Memory limit per worker
CPU_LIMIT="4"                              # CPU core limit
DISK_SPACE_LIMIT="10GB"                    # Disk space limit

# Monitoring
METRICS_ENABLED="true"                     # Enable metrics collection
METRICS_ENDPOINT="http://monitoring:9090"  # Metrics collection endpoint
HEALTH_CHECK_INTERVAL="30"                 # Health check interval (seconds)
```

#### High Availability
```bash
# Clustering and Load Balancing
INSTANCE_ID="dspy-instance-1"              # Unique instance identifier
CLUSTER_NODES="node1:8000,node2:8000"     # Cluster node addresses
LOAD_BALANCER_STRATEGY="round_robin"       # Load balancing strategy
FAILOVER_ENABLED="true"                    # Enable automatic failover

# Data Replication
CACHE_REPLICATION="true"                   # Replicate cache across nodes
EXPERIENCE_SYNC="true"                     # Sync experience database
BACKUP_ENABLED="true"                      # Enable automatic backups
BACKUP_INTERVAL="86400"                    # Backup interval (seconds)
```

### Environment-Specific Configurations

#### Development Environment
```bash
# development.env
NODE_ENV=development
DSPY_DEBUG=true
DSPY_VERBOSE=true
DSPY_TIMEOUT_MS=60000
DSPY_CACHE_TTL_SECONDS=3600
DSPY_PARALLEL=false
LOG_LEVEL=DEBUG
```

#### Staging Environment
```bash
# staging.env
NODE_ENV=staging
DSPY_DEBUG=false
DSPY_VERBOSE=false
DSPY_TIMEOUT_MS=90000
DSPY_CACHE_TTL_SECONDS=43200
DSPY_PARALLEL=true
DSPY_PARALLEL_WORKERS=2
LOG_LEVEL=INFO
METRICS_ENABLED=true
```

#### Production Environment
```bash
# production.env
NODE_ENV=production
DSPY_DEBUG=false
DSPY_VERBOSE=false
DSPY_TIMEOUT_MS=120000
DSPY_CACHE_TTL_SECONDS=86400
DSPY_PARALLEL=true
DSPY_PARALLEL_WORKERS=4
DSPY_MAX_WORKERS=8
LOG_LEVEL=WARNING
METRICS_ENABLED=true
AUDIT_LOG_ENABLED=true
RATE_LIMIT_ENABLED=true
API_KEY_REQUIRED=true
```

### Configuration Validation

#### Environment Validation Script
```bash
#!/bin/bash
# validate-env.sh - Validate environment configuration

# Required variables
REQUIRED_VARS=(
    "GEMINI_API_KEY"
    "DSPY_CACHE_PATH"
    "DSPY_EXPERIENCE_PATH"
)

# Validate required variables
for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var}" ]]; then
        echo "ERROR: Required environment variable $var is not set"
        exit 1
    fi
done

# Validate numeric values
if ! [[ "$DSPY_TIMEOUT_MS" =~ ^[0-9]+$ ]]; then
    echo "ERROR: DSPY_TIMEOUT_MS must be a positive integer"
    exit 1
fi

# Validate file paths
if [[ ! -d "$(dirname "$DSPY_CACHE_PATH")" ]]; then
    echo "WARNING: Cache directory does not exist, will be created"
    mkdir -p "$(dirname "$DSPY_CACHE_PATH")"
fi

echo "Environment validation passed"
```

## Best Practices

### Configuration Recommendations

#### JSON Bonus Settings
- **Start Conservative**: Begin with 0.2-0.3 for most applications
- **Test Impact**: Monitor content quality when increasing bonus weight
- **Schema Dependency**: Higher values for strict API integrations
- **Domain-Specific Tuning**: Adjust based on output format requirements

```typescript
// Recommended JSON bonus by use case
const jsonBonusRecommendations = {
  exploratoryAnalysis: 0.1,    // Focus on content over format
  standardProduction: 0.25,    // Balanced approach
  strictAPI: 0.4,              // Format compliance important
  criticalSystems: 0.6,        // Maximum format reliability
};
```

#### Feature Weight Tuning
- **Keep Critical Features**: Always maintain high weights (2.0) for essential features
- **Balance Trade-offs**: Understand that increasing one weight may decrease others' relative importance
- **Schema-Specific**: Customize weights based on your specific use case
- **Iterative Refinement**: Adjust weights based on observed optimization results

```typescript
// Progressive weight adjustment strategy
class WeightTuningStrategy {
  async optimizeWeights(baseWeights: FeatureWeights, targetMetrics: QualityMetrics) {
    let currentWeights = { ...baseWeights };
    let bestScore = 0;

    // Iterative improvement
    for (let iteration = 0; iteration < 5; iteration++) {
      const result = await optimizeWithWeights(currentWeights);

      if (result.score > bestScore) {
        bestScore = result.score;

        // Analyze which features contributed most
        const contributingFeatures = this.analyzeFeatureContribution(result);

        // Adjust weights based on contribution analysis
        currentWeights = this.adjustWeights(currentWeights, contributingFeatures);
      }
    }

    return currentWeights;
  }
}
```

#### Validation Strategy
- **Development**: Use progressive validation for faster iteration
- **Production**: Consider full validation for final optimization
- **Large Datasets**: Progressive validation is recommended for 100+ examples
- **Critical Applications**: Always use full validation

#### Parallel Processing
- **CPU Cores**: Set workers to match available CPU cores
- **Memory Constraints**: Reduce batch size if experiencing memory issues
- **I/O Bound Tasks**: May benefit from more workers than CPU cores
- **Production Limits**: Implement resource quotas to prevent system overload

### Optimization Workflow

#### Initial Setup
1. Configure schema type and basic options
2. Set conservative JSON bonus (0.25)
3. Review default feature weights
4. Enable progressive validation
5. Start with parallel processing enabled
6. Test with light auto mode first

#### Iterative Improvement
1. Run initial optimization with defaults
2. Analyze results and identify weak areas
3. Adjust feature weights to emphasize problem areas
4. Re-optimize and compare results
5. Promote successful optimizations to baseline
6. Document configuration changes

#### Production Deployment
1. Use full validation for final optimization
2. Clear cache before production runs
3. Promote stable optimizations to baseline
4. Monitor cache hit rates and performance
5. Set up automated monitoring and alerts
6. Implement backup and recovery procedures

### Performance Optimization

#### Cache Management
- **Regular Monitoring**: Check cache statistics weekly
- **Selective Clearing**: Clear cache when changing core configurations
- **Size Management**: Monitor cache size growth
- **TTL Optimization**: Adjust cache TTL based on optimization frequency

#### Resource Usage
- **Worker Tuning**: Adjust worker count based on system performance
- **Batch Sizing**: Optimize batch size for memory usage
- **Timeout Settings**: Set appropriate timeouts for your hardware
- **Memory Monitoring**: Implement memory usage alerts

#### Quality Assurance
```typescript
// Quality assurance checklist
interface QAChecklist {
  preOptimization: {
    validateInputData: boolean;
    checkResourceAvailability: boolean;
    verifyConfiguration: boolean;
    testConnectivity: boolean;
  };
  duringOptimization: {
    monitorProgress: boolean;
    trackResourceUsage: boolean;
    validateIntermediateResults: boolean;
    checkErrorRates: boolean;
  };
  postOptimization: {
    validateResults: boolean;
    compareWithBaseline: boolean;
    testOutputQuality: boolean;
    updateDocumentation: boolean;
  };
}
```

## Complete Troubleshooting Guide

### Optimization Issues

#### Low Optimization Scores
**Symptoms**: Consistently low scores (< 0.5) across optimizations

**Diagnostic Steps**:
1. Check feature weight configuration
2. Analyze training data quality
3. Review JSON bonus settings
4. Examine experience database quality

**Possible Causes & Solutions**:

| Cause | Symptoms | Solution |
|-------|----------|----------|
| Incompatible feature weights | Scores plateau at low values | Review and adjust feature weights for schema type |
| Insufficient training data | High variance in scores | Add more diverse examples to experience database |
| Overly strict JSON bonus | Perfect parsing but poor content | Reduce JSON bonus weight to 0.1-0.2 |
| Poor experience quality | Retrieved experiences have low scores | Prune experience database, raise min score threshold |
| Model limitations | Consistent poor performance across configs | Try different model (gemini-2.5-pro vs flash) |

```bash
# Debugging low scores
# 1. Check experience database quality
jq '.score' python/experience/tutorial-episodes.jsonl | sort -n | tail -10

# 2. Analyze feature weight distribution
echo "Current weights:" && cat ~/.local-storage-dspy-weights

# 3. Test with minimal configuration
curl -X POST /api/gemini/generate \
  -d '{"promptMode":"dspy","dspyOptions":{"jsonBonus":0.1,"auto":"light"}}'
```

#### Slow Optimization Performance
**Symptoms**: Long optimization times (> 5 minutes), timeouts

**Diagnostic Steps**:
1. Check system resource usage
2. Monitor worker utilization
3. Analyze validation set sizes
4. Review parallel processing configuration

**Solutions by Cause**:

| Performance Issue | Quick Fix | Long-term Solution |
|-------------------|-----------|-------------------|
| Too many workers | Reduce parallel workers to CPU count | Implement dynamic worker scaling |
| Large validation sets | Enable progressive validation | Optimize validation subset selection |
| Memory constraints | Reduce batch size | Increase system memory |
| Network timeouts | Increase timeout values | Optimize network configuration |
| Database locks | Stagger optimization requests | Implement request queuing |

```python
# Performance debugging script
import psutil
import time

def diagnose_performance():
    print(f"CPU Usage: {psutil.cpu_percent()}%")
    print(f"Memory Usage: {psutil.virtual_memory().percent}%")
    print(f"Disk Usage: {psutil.disk_usage('/').percent}%")

    # Check for resource bottlenecks
    if psutil.cpu_percent() > 90:
        print("WARNING: High CPU usage detected")
    if psutil.virtual_memory().percent > 85:
        print("WARNING: High memory usage detected")
```

#### Memory and Resource Errors
**Symptoms**: Process crashes, out-of-memory errors, worker timeouts

**Emergency Response**:
```bash
# Immediate fixes
export DSPY_PARALLEL_WORKERS=2
export DSPY_PARALLEL_BATCH_SIZE=4
export DSPY_TIMEOUT_MS=180000

# Restart services
systemctl restart dspy-optimizer
```

**Resource Management Solutions**:
```python
# Memory management configuration
RESOURCE_LIMITS = {
    "max_memory_per_process": "1GB",
    "max_workers": min(4, os.cpu_count()),
    "batch_size": 4,
    "garbage_collection_frequency": 10,  # Every 10 operations
}

def monitor_memory_usage():
    """Monitor and manage memory usage during optimization."""
    import gc
    import psutil

    memory_percent = psutil.virtual_memory().percent
    if memory_percent > 80:
        gc.collect()  # Force garbage collection
        if memory_percent > 90:
            raise ResourceWarning("Memory usage critical")
```

### Cache and Database Issues

#### Cache Problems
**Symptoms**: Unexpected results, stale optimizations, cache errors

**Cache Health Check**:
```bash
# Check cache status
curl -s /api/gemini/cache | jq '.'

# Expected healthy output:
# {
#   "entries": 42,
#   "sizeBytes": 1048576,
#   "ttlSeconds": 86400,
#   "hitRate": 0.7
# }

# Problematic indicators:
# - hitRate < 0.3 (low cache effectiveness)
# - sizeBytes > 100MB (cache too large)
# - entries > 1000 (potential corruption)
```

**Cache Recovery Procedures**:
```bash
# 1. Clear problematic cache
curl -X DELETE /api/gemini/cache

# 2. Verify cache directory permissions
ls -la python/cache/
chmod 755 python/cache/
chmod 644 python/cache/*.jsonl

# 3. Rebuild cache with clean slate
rm -f python/cache/optimizer_cache.jsonl
# Next optimization will rebuild cache
```

#### Experience Database Corruption
**Symptoms**: Experience retrieval errors, malformed records, inconsistent results

**Database Validation**:
```bash
# Validate JSONL format
jq empty python/experience/tutorial-episodes.jsonl
if [ $? -eq 0 ]; then
    echo "Experience database format is valid"
else
    echo "ERROR: Experience database is corrupted"
fi

# Check for required fields
jq 'select(.id == null or .score == null or .schemaType == null)' \
   python/experience/tutorial-episodes.jsonl

# Analyze score distribution
jq '.score' python/experience/tutorial-episodes.jsonl | \
   awk '{sum+=$1; count++} END {print "Average score:", sum/count}'
```

**Database Recovery**:
```bash
# 1. Backup corrupted database
cp python/experience/tutorial-episodes.jsonl \
   python/experience/tutorial-episodes.jsonl.backup

# 2. Clean corrupted entries
jq 'select(.id != null and .score != null and .schemaType != null)' \
   python/experience/tutorial-episodes.jsonl.backup > \
   python/experience/tutorial-episodes.jsonl.clean

# 3. Validate cleaned database
jq empty python/experience/tutorial-episodes.jsonl.clean

# 4. Replace with cleaned version
mv python/experience/tutorial-episodes.jsonl.clean \
   python/experience/tutorial-episodes.jsonl
```

### API and Integration Issues

#### Authentication Errors
**Symptoms**: API key errors, permission denied, unauthorized access

**Common Authentication Issues**:
```bash
# Check API key configuration
echo "GEMINI_API_KEY length: ${#GEMINI_API_KEY}"
# Should be > 30 characters

# Validate API key format
if [[ $GEMINI_API_KEY =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "API key format is valid"
else
    echo "WARNING: API key contains unexpected characters"
fi

# Test API connectivity
curl -H "Authorization: Bearer $GEMINI_API_KEY" \
     "https://generativelanguage.googleapis.com/v1/models"
```

#### Network and Timeout Issues
**Symptoms**: Request timeouts, connection errors, slow responses

**Network Diagnostics**:
```bash
# Check network connectivity
ping -c 3 generativelanguage.googleapis.com

# Test DNS resolution
nslookup generativelanguage.googleapis.com

# Check firewall settings
netstat -tuln | grep 443

# Test API endpoint response time
time curl -s -o /dev/null \
  "https://generativelanguage.googleapis.com/v1/models"
```

**Timeout Configuration**:
```bash
# Increase timeouts for slow networks
export DSPY_TIMEOUT_MS=300000  # 5 minutes
export DSPY_EVAL_TIMEOUT_MS=30000  # 30 seconds
export DSPY_RPM_LIMIT=4  # Reduce rate limit
```

### System Integration Issues

#### Docker and Container Problems
**Symptoms**: Container startup failures, volume mount issues, service communication

**Container Diagnostics**:
```bash
# Check container logs
docker logs dspy-optimizer --tail 50

# Verify environment variables
docker exec dspy-optimizer env | grep DSPY

# Check volume mounts
docker exec dspy-optimizer ls -la /app/python/cache/
docker exec dspy-optimizer ls -la /app/python/experience/

# Test service connectivity
docker exec dspy-optimizer curl -s http://localhost:8000/api/health
```

#### Production Environment Issues
**Symptoms**: Performance degradation, high error rates, service instability

**Production Health Check**:
```bash
# System resource monitoring
htop  # or top for CPU/memory usage
df -h  # Disk space usage
free -h  # Memory availability

# Service status
systemctl status dspy-optimizer
journalctl -u dspy-optimizer --since "1 hour ago"

# Application health
curl -s /api/health/dspy | jq '.'
curl -s /api/metrics | jq '.optimization'
```

**Emergency Recovery Procedures**:
```bash
# 1. Service restart
systemctl restart dspy-optimizer

# 2. Clear problematic caches
curl -X DELETE /api/gemini/cache

# 3. Reset to safe configuration
export DSPY_AUTO="light"
export DSPY_PARALLEL="false"
export DSPY_TIMEOUT_MS="60000"

# 4. Monitor recovery
watch -n 5 'curl -s /api/health | jq ".status"'
```

### Error Code Reference

#### Common Error Codes and Solutions

| Error Code | Description | Immediate Action | Long-term Fix |
|------------|-------------|------------------|---------------|
| `DSPY_001` | Optimization timeout | Increase timeout, reduce complexity | Optimize validation strategy |
| `DSPY_002` | Memory limit exceeded | Reduce workers/batch size | Scale resources |
| `DSPY_003` | Cache corruption | Clear cache | Implement cache validation |
| `DSPY_004` | Experience DB error | Validate/repair database | Add database monitoring |
| `DSPY_005` | API rate limit exceeded | Reduce RPM limit | Implement request queuing |
| `DSPY_006` | Worker process failed | Restart workers | Improve error handling |
| `DSPY_007` | JSON parsing failed | Check feature weights | Validate training data |
| `DSPY_008` | Model unavailable | Retry with backoff | Configure fallback model |

#### Error Recovery Scripts
```bash
# Automated error recovery script
#!/bin/bash
# recover-dspy.sh

ERROR_CODE=$1

case $ERROR_CODE in
    "DSPY_001")
        echo "Handling optimization timeout..."
        export DSPY_TIMEOUT_MS=180000
        export DSPY_AUTO="light"
        ;;
    "DSPY_002")
        echo "Handling memory issues..."
        export DSPY_PARALLEL_WORKERS=2
        export DSPY_PARALLEL_BATCH_SIZE=4
        ;;
    "DSPY_003")
        echo "Handling cache corruption..."
        curl -X DELETE /api/gemini/cache
        ;;
    *)
        echo "Unknown error code: $ERROR_CODE"
        exit 1
        ;;
esac

echo "Recovery actions applied. Restarting service..."
systemctl restart dspy-optimizer
```

## Advanced Configuration

### Custom Optimization Strategies

#### Domain-Specific Configurations
```typescript
// Advanced configuration profiles for different domains
const domainConfigurations = {
  technicalTutorials: {
    featureWeights: {
      schemaFocus: 2.0,
      timecodeOrdering: 2.0,
      screenshotCitation: 1.5,
      grounding: 1.8,
      formatWhenEnforced: 1.2,
    },
    jsonBonus: 0.3,
    experienceTopK: 12,
    auto: "medium",
    progressiveSchedule: [0.2, 0.4, 0.7, 1.0],
  },

  businessMeetings: {
    featureWeights: {
      schemaFocus: 2.0,
      grounding: 2.0,
      formatWhenEnforced: 1.5,
      formatWhenNotEnforced: 1.2,
      screenshotCitation: 0.3,
    },
    jsonBonus: 0.4,
    experienceTopK: 8,
    auto: "heavy",
    alwaysFullValidation: true,
  },

  creativePresentations: {
    featureWeights: {
      grounding: 1.5,
      titleHint: 1.2,
      formatWhenNotEnforced: 1.8,
      schemaFocus: 1.0,
      screenshotCitation: 1.3,
    },
    jsonBonus: 0.15,
    experienceTopK: 15,
    auto: "light",
    parallelEval: true,
  },
};
```

#### Multi-Objective Optimization
```python
def multi_objective_optimization(
    objectives: List[str],
    weights: Dict[str, float],
    payload: Dict[str, Any]
) -> OptimizationResult:
    """
    Optimize for multiple objectives simultaneously:
    - Quality score maximization
    - Response time minimization
    - Resource usage optimization
    - User satisfaction metrics
    """

    # Define objective functions
    objective_functions = {
        "quality": lambda result: result.analysis.score,
        "speed": lambda result: 1.0 / (result.optimization_time + 1),
        "resource": lambda result: 1.0 / (result.resource_usage + 1),
        "satisfaction": lambda result: calculate_user_satisfaction(result),
    }

    # Multi-objective scoring
    def combined_score(result: OptimizationResult) -> float:
        total_score = 0.0
        for objective, weight in weights.items():
            if objective in objective_functions:
                score = objective_functions[objective](result)
                total_score += weight * score
        return total_score

    # Run optimization with custom metric
    return optimize_with_custom_metric(payload, combined_score)
```

### Advanced Integration Patterns

#### Microservices Architecture
```typescript
// Distributed optimization system
interface OptimizationService {
  // Core optimization service
  optimizerService: {
    endpoint: string;
    replicas: number;
    resources: ResourceConfig;
  };

  // Cache service (Redis/MongoDB)
  cacheService: {
    type: "redis" | "mongodb";
    endpoint: string;
    replication: boolean;
  };

  // Experience database service
  experienceService: {
    type: "postgresql" | "mongodb";
    endpoint: string;
    sharding: boolean;
  };

  // Monitoring service
  monitoringService: {
    metrics: string;
    logging: string;
    alerting: string;
  };
}

// Service mesh configuration
const serviceMeshConfig = {
  optimizer: {
    service: "dspy-optimizer",
    port: 8001,
    replicas: 3,
    loadBalancer: "round-robin",
  },
  cache: {
    service: "dspy-cache",
    port: 6379,
    replicas: 2,
    persistence: true,
  },
  experience: {
    service: "dspy-experience",
    port: 5432,
    replicas: 2,
    backup: true,
  },
};
```

#### Event-Driven Architecture
```typescript
// Event-driven optimization pipeline
interface OptimizationEvents {
  "optimization.started": {
    sessionId: string;
    config: OptimizationConfig;
    timestamp: string;
  };

  "optimization.progress": {
    sessionId: string;
    iteration: number;
    score: number;
    stage: string;
  };

  "optimization.completed": {
    sessionId: string;
    result: OptimizationResult;
    duration: number;
  };

  "experience.added": {
    experienceId: string;
    schemaType: string;
    score: number;
  };

  "cache.invalidated": {
    cacheKey: string;
    reason: string;
  };
}

// Event handlers
class OptimizationEventHandler {
  async handleOptimizationStarted(event: OptimizationEvents["optimization.started"]) {
    // Initialize monitoring
    // Allocate resources
    // Update dashboard
  }

  async handleOptimizationCompleted(event: OptimizationEvents["optimization.completed"]) {
    // Update metrics
    // Store results
    // Trigger downstream processes
    // Send notifications
  }
}
```

### Custom Metric Development

#### Advanced Scoring Functions
```python
def create_domain_specific_metric(domain: str) -> Callable:
    """Create custom metrics for specific domains."""

    def technical_tutorial_metric(gold: dspy.Example, pred: dspy.Prediction) -> float:
        content = getattr(pred, "optimized_prompt", "")

        # Base feature scoring
        base_score = calculate_base_features(gold, pred)

        # Domain-specific bonuses
        technical_complexity = analyze_technical_complexity(content)
        visual_integration = score_visual_integration(content, gold)
        step_clarity = evaluate_step_clarity(content)

        # Weighted combination
        return min(1.0, base_score +
                  0.1 * technical_complexity +
                  0.1 * visual_integration +
                  0.05 * step_clarity)

    def business_meeting_metric(gold: dspy.Example, pred: dspy.Prediction) -> float:
        content = getattr(pred, "optimized_prompt", "")

        # Base feature scoring
        base_score = calculate_base_features(gold, pred)

        # Business-specific criteria
        executive_readiness = score_executive_readiness(content)
        action_item_clarity = evaluate_action_items(content)
        decision_tracking = score_decision_tracking(content)

        return min(1.0, base_score +
                  0.15 * executive_readiness +
                  0.1 * action_item_clarity +
                  0.1 * decision_tracking)

    metrics = {
        "technical": technical_tutorial_metric,
        "business": business_meeting_metric,
    }

    return metrics.get(domain, calculate_base_features)
```

#### A/B Testing Framework
```typescript
// A/B testing for optimization strategies
interface ABTest {
  id: string;
  name: string;
  variants: {
    control: OptimizationConfig;
    treatment: OptimizationConfig;
  };
  trafficSplit: number;  // 0.0 to 1.0
  metrics: string[];
  duration: number;      // days
}

class ABTestManager {
  async runTest(test: ABTest, requests: OptimizationRequest[]): Promise<ABTestResult> {
    const results = { control: [], treatment: [] };

    for (const request of requests) {
      const variant = Math.random() < test.trafficSplit ? 'treatment' : 'control';
      const config = test.variants[variant];

      const result = await optimizePrompt({ ...request, ...config });
      results[variant].push(result);
    }

    return this.analyzeResults(test, results);
  }

  private analyzeResults(test: ABTest, results: ABTestResults): ABTestResult {
    // Statistical analysis
    const controlMetrics = this.calculateMetrics(results.control, test.metrics);
    const treatmentMetrics = this.calculateMetrics(results.treatment, test.metrics);

    // Significance testing
    const significance = this.performSignificanceTest(controlMetrics, treatmentMetrics);

    return {
      testId: test.id,
      controlMetrics,
      treatmentMetrics,
      significance,
      recommendation: this.generateRecommendation(significance),
    };
  }
}
```

### Performance Tuning and Optimization

#### Advanced Caching Strategies
```python
class AdaptiveCacheManager:
    """Intelligent cache management with adaptive strategies."""

    def __init__(self):
        self.cache_strategies = {
            "lru": LRUCache(maxsize=100),
            "lfu": LFUCache(maxsize=100),
            "adaptive": AdaptiveCache(maxsize=100),
        }
        self.performance_history = []

    def get_optimal_strategy(self) -> str:
        """Select optimal caching strategy based on usage patterns."""
        if len(self.performance_history) < 10:
            return "lru"  # Default for cold start

        # Analyze access patterns
        access_pattern = self.analyze_access_patterns()

        if access_pattern.temporal_locality > 0.7:
            return "lru"  # High temporal locality
        elif access_pattern.frequency_distribution > 0.6:
            return "lfu"  # Frequency-based access
        else:
            return "adaptive"  # Mixed patterns

    def adaptive_cache_sizing(self, system_metrics: SystemMetrics) -> int:
        """Dynamically adjust cache size based on system resources."""
        available_memory = system_metrics.available_memory_mb
        optimization_load = system_metrics.active_optimizations

        # Base cache size
        base_size = 100

        # Memory-based adjustment
        if available_memory > 2000:  # > 2GB available
            memory_multiplier = 2.0
        elif available_memory > 1000:  # > 1GB available
            memory_multiplier = 1.5
        else:
            memory_multiplier = 0.5

        # Load-based adjustment
        load_multiplier = max(0.5, 2.0 - (optimization_load / 5))

        return int(base_size * memory_multiplier * load_multiplier)
```

#### Resource Pool Management
```python
class DynamicResourcePool:
    """Dynamic resource allocation for optimization workers."""

    def __init__(self, max_workers: int = 8):
        self.max_workers = max_workers
        self.active_workers = 0
        self.worker_pool = []
        self.resource_monitor = ResourceMonitor()

    async def allocate_workers(self, optimization_complexity: float) -> int:
        """Allocate optimal number of workers based on complexity and resources."""

        # System resource check
        cpu_usage = self.resource_monitor.get_cpu_usage()
        memory_usage = self.resource_monitor.get_memory_usage()

        # Complexity-based worker calculation
        if optimization_complexity < 0.3:
            base_workers = 2
        elif optimization_complexity < 0.7:
            base_workers = 4
        else:
            base_workers = 6

        # Resource-based adjustment
        if cpu_usage > 80 or memory_usage > 80:
            resource_factor = 0.5
        elif cpu_usage > 60 or memory_usage > 60:
            resource_factor = 0.75
        else:
            resource_factor = 1.0

        # Calculate final worker count
        optimal_workers = min(
            self.max_workers,
            max(1, int(base_workers * resource_factor))
        )

        return optimal_workers

    async def scale_workers(self, target_count: int):
        """Dynamically scale worker count up or down."""
        current_count = len(self.worker_pool)

        if target_count > current_count:
            # Scale up
            for _ in range(target_count - current_count):
                worker = await self.create_worker()
                self.worker_pool.append(worker)
        elif target_count < current_count:
            # Scale down
            workers_to_remove = current_count - target_count
            for _ in range(workers_to_remove):
                worker = self.worker_pool.pop()
                await self.terminate_worker(worker)
```

## Conclusion

This comprehensive DSPy GEPA optimization system documentation provides complete coverage of all aspects needed to effectively utilize DSPy and GEPA for optimal prompt optimization results. The system offers:

### Key Capabilities
- **Complete Configuration Control**: Every parameter and option documented with examples
- **Production-Ready Architecture**: Scalable, monitorable, and maintainable system design
- **Advanced Optimization Strategies**: Multi-stage, ensemble, and domain-specific approaches
- **Comprehensive Experience Management**: Full lifecycle of experience database operations
- **Real-time Monitoring**: Complete debugging, monitoring, and alerting capabilities
- **Flexible Integration**: API, webhook, and batch processing support

### Getting Maximum Value

#### For Developers
- Start with the [Complete Configuration Reference](#complete-configuration-reference) to understand all available options
- Use [GEPA Auto Modes](#gepa-auto-modes-guide) to select the right optimization intensity
- Implement [Advanced Optimization Strategies](#advanced-optimization-strategies) for complex scenarios
- Follow [Best Practices](#best-practices) for reliable optimization workflows

#### For Production Teams
- Review [Production Deployment](#production-deployment) for scaling considerations
- Implement [Advanced Debugging and Monitoring](#advanced-debugging-and-monitoring) for operational visibility
- Use [Environment Variables Reference](#environment-variables-reference) for proper configuration management
- Follow [Complete Troubleshooting Guide](#complete-troubleshooting-guide) for issue resolution

#### for Research and Advanced Users
- Explore [Experience Database Management](#experience-database-management) for optimization insights
- Implement [Custom Optimization Strategies](#advanced-optimization-strategies) for specialized use cases
- Use [API Integration](#api-integration-and-webhooks) for system integration
- Leverage [Advanced Configuration](#advanced-configuration) for maximum flexibility

### Optimization Journey
1. **Start Simple**: Use default configurations with medium auto mode
2. **Monitor and Measure**: Implement monitoring and track key metrics
3. **Iterative Improvement**: Gradually refine weights and settings based on results
4. **Scale Thoughtfully**: Add advanced features as requirements grow
5. **Maintain Quality**: Regular experience database maintenance and monitoring

The DSPy GEPA system provides the foundation for achieving consistently high-quality, optimized prompts that improve over time through experience-driven learning. By following this documentation, teams can maximize the value of their prompt optimization efforts while maintaining system reliability and performance.

For additional support or advanced customization needs, refer to the source code in `/Users/bc/Desktop/gotime/ai-tutorial-gen/lib/dspy.ts` and `/Users/bc/Desktop/gotime/ai-tutorial-gen/python/dspy_optimize.py`.