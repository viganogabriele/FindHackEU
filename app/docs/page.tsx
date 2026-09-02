import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Code,
  Database,
  Map,
  Search,
  Calendar,
  ExternalLink,
  Heart,
  Send,
} from "lucide-react";
import { FaGithub } from "react-icons/fa6";

export const metadata = {
  title: "Documentation - FindHackEU",
  description: "Guide to the FindHackEU website and public API",
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </Button>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <div className="mb-6 flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            <h1 className="mb-0 text-3xl font-bold">Documentation</h1>
          </div>
          <p className="text-muted-foreground mb-6">
            A practical guide to browsing FindHackEU and using its public API.
          </p>

          <Separator className="my-8 [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]" />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 not-prose mb-8">
            <Card className="gap-0 rounded-lg p-4 shadow-none">
              <Search className="h-6 w-6 text-primary mb-2" />
              <h3 className="font-semibold mb-2">Browse Hackathons</h3>
              <p className="text-sm text-muted-foreground">
                Search and filter hackathons across Europe.
              </p>
            </Card>
            <Card className="gap-0 rounded-lg p-4 shadow-none">
              <Code className="h-6 w-6 text-primary mb-2" />
              <h3 className="font-semibold mb-2">REST API</h3>
              <p className="text-sm text-muted-foreground">
                Read published hackathon data programmatically.
              </p>
            </Card>
            <Card className="gap-0 rounded-lg p-4 shadow-none">
              <Map className="h-6 w-6 text-primary mb-2" />
              <h3 className="font-semibold mb-2">Interactive Map</h3>
              <p className="text-sm text-muted-foreground">
                Explore event locations on a clustered map.
              </p>
            </Card>
          </div>

          <section className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
              <Search className="h-6 w-6" />
              Getting Started
            </h2>
            <p>
              FindHackEU brings together hackathons taking place across Europe.
              Its ingestion pipeline collects events from several sources,
              removes duplicates, and enriches available location data before
              entries appear in the public listing.
            </p>

            <h3 className="mb-2 mt-6 text-xl font-medium">Key Features</h3>
            <ul className="space-y-2">
              <li>
                <strong>Scheduled discovery:</strong> The pipeline refreshes the
                published dataset daily.
              </li>
              <li>
                <strong>Filters:</strong> Narrow results by text, location and
                radius, topic, date, and event status.
              </li>
              <li>
                <strong>Map:</strong> Review matching events on a clustered map.
              </li>
              <li>
                <strong>Bookmarks:</strong> Save events in this browser for
                later.
              </li>
              <li>
                <strong>Submissions:</strong> Suggest a missing event for
                moderation.
              </li>
              <li>
                <strong>Public API:</strong> Access published data
                programmatically.
              </li>
              <li>
                <strong>Responsive interface:</strong> Use the listing on
                desktop and mobile devices.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
              <BookOpen className="h-6 w-6" />
              Internationalization
            </h2>

            <p>
              The public interface is available in multiple languages. App
              translations are maintained in <code>i18n/</code>; this page is
              currently written in English.
            </p>

            <h3 className="mb-2 mt-4 text-xl font-medium">
              Available Languages
            </h3>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>English</li>
              <li>Italian</li>
              <li>German</li>
              <li>Spanish</li>
              <li>French</li>
              <li>Dutch</li>
              <li>Portuguese</li>
              <li>Polish</li>
              <li>Romanian</li>
              <li>Swedish</li>
            </ul>

            <p className="mt-4">
              Contributors should update the JSON files in <code>i18n/</code>{" "}
              together and keep their keys aligned. The translation context in{" "}
              <code>contexts/translation-context.tsx</code> provides the
              application&apos;s translation helpers.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
              <Calendar className="h-6 w-6" />
              Using the Platform
            </h2>

            <h3 className="mb-2 mt-4 text-xl font-medium">
              Browsing Hackathons
            </h3>
            <p>
              The listing presents each event as a card. Depending on the source
              data available, a card can include:
            </p>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>
                <strong>Event name:</strong> The published event title
              </li>
              <li>
                <strong>Location:</strong> City, country, and location type when
                known
              </li>
              <li>
                <strong>Dates:</strong> Start and end times, when supplied
              </li>
              <li>
                <strong>Topics:</strong> Applicable event tags
              </li>
              <li>
                <strong>Notes:</strong> Additional details provided by the
                source
              </li>
              <li>
                <strong>Event link:</strong> The source page for registration or
                details
              </li>
            </ul>

            <h3 className="mb-2 mt-6 text-xl font-medium">Filtering Options</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 not-prose">
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <h4 className="font-semibold mb-2">Search</h4>
                <p className="text-sm text-muted-foreground">
                  Match event names and available text.
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <h4 className="font-semibold mb-2">Status</h4>
                <p className="text-sm text-muted-foreground">
                  Switch between upcoming and past listings.
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <h4 className="font-semibold mb-2">Location</h4>
                <p className="text-sm text-muted-foreground">
                  Filter by country or city, or search within a radius of a
                  chosen place.
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <h4 className="font-semibold mb-2">Topics</h4>
                <p className="text-sm text-muted-foreground">
                  Include one or more topics.
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none md:col-span-2">
                <h4 className="font-semibold mb-2">Date Range</h4>
                <p className="text-sm text-muted-foreground">
                  Restrict results to a date range.
                </p>
              </Card>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
              <Code className="h-6 w-6" />
              API Documentation
            </h2>
            <p>
              The read-only API exposes published hackathons as JSON. It is
              intended for reasonable use by applications and integrations.
            </p>

            <h3 className="mb-2 mt-6 text-xl font-medium">Base URL</h3>
            <div className="bg-muted rounded-lg p-4 font-mono text-sm">
              https://your-findhackeu-deployment.example/api
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Replace the example host with the URL of the FindHackEU deployment
              you are querying.
            </p>

            <h3 className="mb-2 mt-6 text-xl font-medium">Endpoints</h3>

            <div className="space-y-6 mt-4">
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="default" className="bg-green-600">
                    GET
                  </Badge>
                  <code className="text-sm">/hackathons</code>
                </div>
                <p className="text-sm mb-3">
                  Return published hackathons for the requested status.
                </p>

                <h4 className="font-semibold mb-2">Query Parameters</h4>
                <ul className="text-sm space-y-1">
                  <li>
                    <code>status</code> — Optional; one of <code>upcoming</code>
                    , <code>past</code>, or <code>estimated</code>. Defaults to{" "}
                    <code>upcoming</code>.
                  </li>
                </ul>

                <h4 className="font-semibold mb-2 mt-4">Example Request</h4>
                <div className="bg-muted rounded-lg p-3 font-mono text-xs overflow-x-auto">
                  GET /api/hackathons?status=upcoming
                </div>
              </Card>

              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <h4 className="font-semibold mb-2">Response Format</h4>
                <div className="bg-muted rounded-lg p-3 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                  {`{
  "data": [
    {
      "id": "uuid",
      "name": "AI Hackathon Munich",
      "city": "Munich",
      "country_code": "DE",
      "date_start": "2025-06-15T09:00:00+00:00",
      "date_end": "2025-06-16T18:00:00+00:00",
      "topics": ["AI", "Machine Learning"],
      "notes": "Bring your laptop and creativity!",
      "url": "https://example.com/hackathon",
      "status": "upcoming",
      "is_new": true
    },
    ...
  ]
}`}
                </div>
              </Card>
            </div>

            <h3 className="mb-2 mt-6 text-xl font-medium">Rate Limiting</h3>
            <p>
              In production, the public API applies these per-client limits:
            </p>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>
                <strong>Hourly limit:</strong> 100 requests per hour
              </li>
              <li>
                <strong>Burst limit:</strong> 10 requests per minute
              </li>
              <li>
                Limits are disabled outside production to support local
                development.
              </li>
            </ul>

            <h3 className="mb-2 mt-6 text-xl font-medium">Error Codes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 not-prose">
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <Badge variant="destructive" className="mb-2">
                  400
                </Badge>
                <h4 className="font-semibold mb-1">Bad Request</h4>
                <p className="text-sm text-muted-foreground">
                  An invalid query parameter was supplied.
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <Badge variant="destructive" className="mb-2">
                  429
                </Badge>
                <h4 className="font-semibold mb-1">Too Many Requests</h4>
                <p className="text-sm text-muted-foreground">
                  The production rate limit was exceeded.
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <Badge variant="destructive" className="mb-2">
                  500
                </Badge>
                <h4 className="font-semibold mb-1">Internal Server Error</h4>
                <p className="text-sm text-muted-foreground">
                  The server could not complete the request.
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <Badge variant="destructive" className="mb-2">
                  503
                </Badge>
                <h4 className="font-semibold mb-1">Service Unavailable</h4>
                <p className="text-sm text-muted-foreground">
                  The service is temporarily unavailable.
                </p>
              </Card>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
              <Heart className="h-6 w-6" />
              Bookmarks &amp; Submitting Hackathons
            </h2>
            <p>
              Save events locally or suggest a missing one. Neither action
              requires an account.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 not-prose">
              <Card className="gap-0 rounded-lg p-6 shadow-none">
                <Heart className="h-6 w-6 text-primary mb-3" />
                <h3 className="font-semibold mb-2">Bookmarks</h3>
                <p className="text-sm text-muted-foreground">
                  Select the heart on an event card to save it. Bookmarks stay
                  in this browser&apos;s local storage and can be used to filter
                  the listing.
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-6 shadow-none">
                <Send className="h-6 w-6 text-primary mb-3" />
                <h3 className="font-semibold mb-2">Submit a Hackathon</h3>
                <p className="text-sm text-muted-foreground">
                  Use the submission form to suggest a missing event. A
                  maintainer reviews every submission before it can appear in
                  the public listing.
                </p>
              </Card>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              Discord, Telegram, and X (Twitter) notifications are not currently
              active.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
              <Database className="h-6 w-6" />
              Technical Architecture
            </h2>
            <p>
              FindHackEU uses a TypeScript application, a Supabase PostgreSQL
              database, and a scheduled ingestion workflow.
            </p>

            <h3 className="mb-2 mt-6 text-xl font-medium">Technology Stack</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 not-prose">
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <h4 className="font-semibold mb-2">Frontend</h4>
                <ul className="text-sm space-y-1">
                  <li>Next.js 16 with App Router</li>
                  <li>TypeScript</li>
                  <li>Tailwind CSS</li>
                  <li>shadcn/ui components</li>
                </ul>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <h4 className="font-semibold mb-2">Backend</h4>
                <ul className="text-sm space-y-1">
                  <li>Next.js Route Handlers</li>
                  <li>Supabase (PostgreSQL)</li>
                  <li>Row Level Security</li>
                </ul>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <h4 className="font-semibold mb-2">Infrastructure</h4>
                <ul className="text-sm space-y-1">
                  <li>Deployment environment</li>
                  <li>GitHub Actions scheduled workflow</li>
                  <li>Daily ingestion schedule</li>
                </ul>
              </Card>
            </div>

            <h3 className="mb-2 mt-6 text-xl font-medium">Update Frequency</h3>
            <p>
              A scheduled workflow runs the ingestion pipeline once per day.
              Individual source failures are reported without preventing the
              remaining stages from completing.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">Contributing</h2>
            <p>
              FindHackEU is open source. Contributions that improve coverage,
              correctness, accessibility, or documentation are welcome.
            </p>

            <h3 className="mb-2 mt-6 text-xl font-medium">How to Contribute</h3>
            <ul className="space-y-2">
              <li>
                <strong>Report an issue:</strong> Use GitHub for a bug, missing
                event, or documentation problem.{" "}
                <Link
                  href="https://github.com/viganogabriele/FindHackEU/issues"
                  className="text-primary hover:underline"
                >
                  Open an issue
                </Link>
              </li>
              <li>
                <strong>Contribute code:</strong> Fork the repository, make a
                focused change, and open a pull request.
              </li>
              <li>
                <strong>Suggest improvements:</strong> Describe the problem and
                proposed outcome in an issue before undertaking larger work.
              </li>
            </ul>

            <h3 className="mb-2 mt-6 text-xl font-medium">Development Setup</h3>
            <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-2">
              <div># Clone the repository</div>
              <div>
                git clone https://github.com/viganogabriele/FindHackEU.git
              </div>
              <div></div>
              <div># Install dependencies</div>
              <div>npm install</div>
              <div></div>
              <div># Set up environment variables</div>
              <div>cp .env.example .env.local</div>
              <div></div>
              <div># Run development server</div>
              <div>npm run dev</div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">Support & Community</h2>
            <p>Use the channel that best fits the request.</p>

            <div className="grid grid-cols-1 gap-6 mt-6 not-prose">
              <Card className="gap-0 rounded-lg p-6 shadow-none">
                <FaGithub className="h-6 w-6 mb-3" />
                <h3 className="font-semibold mb-2">GitHub Issues</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Best for bug reports, proposed improvements, and technical
                  discussion.
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link
                    href="https://github.com/viganogabriele/FindHackEU/issues"
                    target="_blank"
                  >
                    Open Issue <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </Card>

              <Card className="gap-0 rounded-lg p-6 shadow-none">
                <Send className="h-6 w-6 mb-3" />
                <h3 className="font-semibold mb-2">Email the Maintainer</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  FindHackEU is maintained by Gabriele Viganò. Use email for
                  questions not suited to a public issue.
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href="mailto:info@viganogabriele.com">
                    info@viganogabriele.com
                  </Link>
                </Button>
              </Card>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              Discord, Telegram, and X (Twitter) notification channels are not
              currently active.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">
              Frequently Asked Questions
            </h2>

            <div className="space-y-6">
              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-2">
                  How often is the data updated?
                </h3>
                <p className="text-sm text-muted-foreground">
                  The scheduled ingestion pipeline runs once per day.
                </p>
              </div>

              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-2">
                  Can I submit a hackathon that&apos;s missing?
                </h3>
                <p className="text-sm text-muted-foreground">
                  Yes. Use the public submission form or open a GitHub issue
                  with the event details. A maintainer reviews each suggestion
                  before publication.
                </p>
              </div>

              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-2">Is the API free to use?</h3>
                <p className="text-sm text-muted-foreground">
                  The read-only API is publicly available. In production it is
                  rate-limited to protect the service; see the API section
                  above.
                </p>
              </div>

              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-2">
                  How do you determine if a hackathon is &quot;European&quot;?
                </h3>
                <p className="text-sm text-muted-foreground">
                  The discovery pipeline uses source location data to retain
                  events in European countries. Events with unresolved locations
                  may remain available when the source explicitly identifies
                  them as online or hybrid.
                </p>
              </div>

              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-2">
                  Can I use this data for my own project?
                </h3>
                <p className="text-sm text-muted-foreground">
                  Yes. Use the public API within its production rate limits and
                  attribute FindHackEU when its data materially supports your
                  project.
                </p>
              </div>

              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-2">
                  Who maintains FindHackEU?
                </h3>
                <p className="text-sm text-muted-foreground">
                  FindHackEU is maintained by Gabriele Viganò. It is an
                  independent MIT-licensed project, originally inspired by and
                  forked from HackTrack EU by Lorenzo Palaia.
                </p>
              </div>
            </div>
          </section>

          <div className="border-t pt-6 text-center text-muted-foreground">
            <p>
              For further help, open a GitHub issue or contact the maintainer by
              email.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
