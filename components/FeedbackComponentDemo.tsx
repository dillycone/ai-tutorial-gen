"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { AlertCircle, CheckCircle, Info, Settings, User, LogOut, Copy, Edit, Trash2, Star } from "lucide-react"

export default function FeedbackComponentDemo() {
  const [progress, setProgress] = useState(33)
  const [loading, setLoading] = useState(false)

  const handleLoadingDemo = () => {
    setLoading(true)
    setProgress(0)

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setLoading(false)
          toast.success("Loading completed!", {
            description: "The process finished successfully."
          })
          return 100
        }
        return prev + 10
      })
    }, 200)
  }

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">ShadCN/UI Feedback Components Demo</h1>
        <p className="text-muted-foreground">
          Test all the installed feedback and notification components
        </p>
      </div>

      {/* Toast Notifications */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Toast Notifications (Sonner)</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => toast("Basic notification")}>
            Basic Toast
          </Button>
          <Button
            onClick={() => toast.success("Success!", { description: "Operation completed successfully" })}
            variant="outline"
          >
            Success Toast
          </Button>
          <Button
            onClick={() => toast.error("Error occurred!", { description: "Something went wrong" })}
            variant="destructive"
          >
            Error Toast
          </Button>
          <Button
            onClick={() => toast.warning("Warning!", { description: "Please be careful" })}
            variant="secondary"
          >
            Warning Toast
          </Button>
          <Button
            onClick={() => toast.info("Information", { description: "Here&apos;s some useful info" })}
          >
            Info Toast
          </Button>
        </div>
      </section>

      {/* Alerts */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Alert Messages</h2>
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Default Alert</AlertTitle>
            <AlertDescription>
              This is a default alert message with some important information.
            </AlertDescription>
          </Alert>

          <Alert className="border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-100">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Success Alert</AlertTitle>
            <AlertDescription>
              Your operation completed successfully!
            </AlertDescription>
          </Alert>

          <Alert className="border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-100">
            <Info className="h-4 w-4" />
            <AlertTitle>Information Alert</AlertTitle>
            <AlertDescription>
              Here&apos;s some helpful information you should know.
            </AlertDescription>
          </Alert>
        </div>
      </section>

      {/* Progress and Loading States */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Progress & Loading States</h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress Demo</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <Button onClick={handleLoadingDemo} disabled={loading}>
            {loading ? "Loading..." : "Start Loading Demo"}
          </Button>

          <div className="space-y-3">
            <h3 className="text-lg font-medium">Skeleton Placeholders</h3>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="flex space-x-2">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Badges */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Status Badges</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Error</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            Success
          </Badge>
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
            Warning
          </Badge>
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
            Info
          </Badge>
        </div>
      </section>

      {/* Tooltips */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Tooltips</h2>
        <div className="flex flex-wrap gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Hover for tooltip</Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>This is a helpful tooltip!</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Badge>Badge with tooltip</Badge>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Badges can have tooltips too</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </section>

      {/* Popover */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Popover</h2>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Open Popover</Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="grid gap-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Popover Content</h4>
                <p className="text-sm text-muted-foreground">
                  This is a popover with some content. It can contain any React components.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => toast.success("Action performed!")}>
                  Action
                </Button>
                <Button size="sm" variant="outline">
                  Cancel
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </section>

      {/* Dropdown Menu */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Dropdown Menu</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => toast.info("Profile clicked")}>
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast.info("Settings clicked")}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => toast.success("Logged out")}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </section>

      {/* Context Menu */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Context Menu</h2>
        <ContextMenu>
          <ContextMenuTrigger className="flex h-32 w-64 items-center justify-center rounded-md border border-dashed text-sm">
            Right-click me
          </ContextMenuTrigger>
          <ContextMenuContent className="w-64">
            <ContextMenuItem onClick={() => toast.info("Copy action")}>
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </ContextMenuItem>
            <ContextMenuItem onClick={() => toast.info("Edit action")}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </ContextMenuItem>
            <ContextMenuItem onClick={() => toast.warning("Delete action")}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </section>

      {/* Hover Card */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Hover Card</h2>
        <div className="flex gap-4">
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="link">@username</Button>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="flex justify-between space-x-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">@username</h4>
                  <p className="text-sm">
                    This is a hover card with user information. It appears when you hover over the trigger.
                  </p>
                  <div className="flex items-center pt-2">
                    <Star className="mr-2 h-4 w-4 opacity-70" />
                    <span className="text-xs text-muted-foreground">
                      Joined December 2021
                    </span>
                  </div>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      </section>
    </div>
  )
}