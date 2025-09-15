import VideoWorkbench from "@/components/VideoWorkbench";

export default function Page() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="border-b border-gray-200 bg-white/95 backdrop-blur shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AI-Powered Video Tutorial Generator</h1>
            <p className="mt-1 text-sm text-gray-600">
              Capture moments, organize them into structured knowledge, and export polished walkthroughs or meeting notes.
            </p>
          </div>
          <a
            href="https://support.google.com/gemini"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:scale-105 hover:shadow-md hover:bg-gray-50 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Need help?
            <span aria-hidden>↗</span>
          </a>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <VideoWorkbench />
      </div>
    </main>
  );
}
