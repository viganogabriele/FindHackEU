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
  description: "Complete documentation for FindHackEU platform and API",
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
            Complete guide to using the FindHackEU platform, API, and services
          </p>

          <Separator className="my-6" />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 not-prose mb-8">
            <Card className="gap-0 rounded-lg p-4 shadow-none">
              <Search className="h-6 w-6 text-primary mb-2" />
              <h3 className="font-semibold mb-2">Browse Hackathons</h3>
              <p className="text-sm text-muted-foreground">
                Discover and filter European hackathons with advanced search
              </p>
            </Card>
            <Card className="gap-0 rounded-lg p-4 shadow-none">
              <Code className="h-6 w-6 text-primary mb-2" />
              <h3 className="font-semibold mb-2">REST API</h3>
              <p className="text-sm text-muted-foreground">
                Access hackathon data programmatically with our API
              </p>
            </Card>
            <Card className="gap-0 rounded-lg p-4 shadow-none">
              <Map className="h-6 w-6 text-primary mb-2" />
              <h3 className="font-semibold mb-2">Interactive Map</h3>
              <p className="text-sm text-muted-foreground">
                Explore hackathons on a map with location-based clustering
              </p>
            </Card>
          </div>

          <section className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
              <Search className="h-6 w-6" />
              Getting Started
            </h2>
            <p>
              FindHackEU is a comprehensive platform for discovering hackathons
              across Europe. Our system automatically scans and aggregates
              hackathon information, providing you with the most up-to-date
              listings.
            </p>

            <h3 className="mb-2 mt-6 text-xl font-medium">Key Features</h3>
            <ul className="space-y-2">
              <li>
                🔄 <strong>Automated Updates:</strong> New hackathons discovered
                daily
              </li>
              <li>
                🔍 <strong>Advanced Filtering:</strong> Search by location
                (including a radius search), topics, dates, and status
              </li>
              <li>
                🗺️ <strong>Interactive Map:</strong> Browse hackathons visually
                with clustering
              </li>
              <li>
                ❤️ <strong>Bookmarks:</strong> Save your favorite hackathons
                locally in your browser
              </li>
              <li>
                📮 <strong>Community Submissions:</strong> Suggest a hackathon
                that&apos;s missing through our public submission form
              </li>
              <li>
                📊 <strong>RESTful API:</strong> Access data programmatically
              </li>
              <li>
                📱 <strong>Responsive Design:</strong> Works perfectly on all
                devices
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
              <BookOpen className="h-6 w-6" />
              Internationalization
            </h2>

            <p>
              FindHackEU supports multiple interface languages. The main
              application UI loads translations from the <code>i18n/</code>
              directory; documentation pages are currently kept in English.
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
              To add or edit translations, update the JSON files in{" "}
              <code>i18n/</code>
              ensuring keys remain consistent across languages. The translation
              context in <code>contexts/translation-context.tsx</code> exposes
              helpers used by the app.
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
              The main interface displays hackathons in an easy-to-browse card
              format. Each card shows:
            </p>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>
                <strong>Event Name:</strong> Full hackathon title
              </li>
              <li>
                <strong>Location:</strong> City and country
              </li>
              <li>
                <strong>Dates:</strong> Start and end dates (if available)
              </li>
              <li>
                <strong>Topics:</strong> Relevant tags (AI, Crypto, Web3, etc.)
              </li>
              <li>
                <strong>Notes:</strong> Additional event details and
                requirements
              </li>
              <li>
                <strong>Registration Link:</strong> Direct link to sign up
              </li>
            </ul>

            <h3 className="mb-2 mt-6 text-xl font-medium">Filtering Options</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 not-prose">
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <h4 className="font-semibold mb-2">Search</h4>
                <p className="text-sm text-muted-foreground">
                  Find hackathons by name using the search box
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <h4 className="font-semibold mb-2">Status</h4>
                <p className="text-sm text-muted-foreground">
                  Toggle between upcoming and past events
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <h4 className="font-semibold mb-2">Location</h4>
                <p className="text-sm text-muted-foreground">
                  Filter by specific cities, countries, or a distance radius
                  from a place you choose
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <h4 className="font-semibold mb-2">Topics</h4>
                <p className="text-sm text-muted-foreground">
                  Select multiple topics of interest
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none md:col-span-2">
                <h4 className="font-semibold mb-2">Date Range</h4>
                <p className="text-sm text-muted-foreground">
                  Choose specific date ranges for your search
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
              Our REST API provides programmatic access to hackathon data. The
              API is free to use with reasonable rate limits.
            </p>

            <h3 className="mb-2 mt-6 text-xl font-medium">Base URL</h3>
            <div className="bg-muted rounded-lg p-4 font-mono text-sm">
              https://your-findhackeu-deployment.example/api
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Replace the host above with wherever FindHackEU is deployed (for
              example, your Vercel deployment URL).
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
                  Retrieve hackathons with optional filtering
                </p>

                <h4 className="font-semibold mb-2">Query Parameters</h4>
                <ul className="text-sm space-y-1">
                  <li>
                    <code>status</code> - Filter by status (upcoming, past,
                    estimated)
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
              The API implements reasonable rate limiting to ensure fair usage:
            </p>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>
                <strong>Free usage:</strong> 100 requests per hour per IP
              </li>
              <li>
                <strong>Burst limit:</strong> 10 requests per minute
              </li>
              <li>
                <strong>Commercial usage:</strong> Contact us for higher limits
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
                  Invalid query parameters
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <Badge variant="destructive" className="mb-2">
                  429
                </Badge>
                <h4 className="font-semibold mb-1">Too Many Requests</h4>
                <p className="text-sm text-muted-foreground">
                  Rate limit exceeded
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <Badge variant="destructive" className="mb-2">
                  500
                </Badge>
                <h4 className="font-semibold mb-1">Internal Server Error</h4>
                <p className="text-sm text-muted-foreground">
                  Server-side error
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <Badge variant="destructive" className="mb-2">
                  503
                </Badge>
                <h4 className="font-semibold mb-1">Service Unavailable</h4>
                <p className="text-sm text-muted-foreground">
                  Temporary maintenance
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
              Two lightweight ways to make the platform your own, no account
              required.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 not-prose">
              <Card className="gap-0 rounded-lg p-6 shadow-none">
                <Heart className="h-6 w-6 text-primary mb-3" />
                <h3 className="font-semibold mb-2">Bookmarks</h3>
                <p className="text-sm text-muted-foreground">
                  Tap the heart icon on any hackathon card to save it. Bookmarks
                  are stored only in your browser&apos;s local storage &mdash;
                  they never leave your device &mdash; and you can filter the
                  listing to show only your favorites.
                </p>
              </Card>
              <Card className="gap-0 rounded-lg p-6 shadow-none">
                <Send className="h-6 w-6 text-primary mb-3" />
                <h3 className="font-semibold mb-2">Submit a Hackathon</h3>
                <p className="text-sm text-muted-foreground">
                  Missing an event? Use the submission form (in the header, next
                  to the search bar) to suggest a URL. Every submission is
                  reviewed by a maintainer before it appears in the public
                  listing.
                </p>
              </Card>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              Note: Discord, Telegram, and X (Twitter) notification channels are
              not currently active. They may return in the future.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
              <Database className="h-6 w-6" />
              Technical Architecture
            </h2>
            <p>
              FindHackEU is built with modern technologies to ensure
              reliability, performance, and scalability.
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
                  <li>Next.js API Routes</li>
                  <li>Supabase (PostgreSQL)</li>
                  <li>Row Level Security</li>
                </ul>
              </Card>
              <Card className="gap-0 rounded-lg p-4 shadow-none">
                <h4 className="font-semibold mb-2">Infrastructure</h4>
                <ul className="text-sm space-y-1">
                  <li>Vercel deployment</li>
                  <li>GitHub Actions CI/CD</li>
                  <li>Cron job automation</li>
                </ul>
              </Card>
            </div>

            <h3 className="mb-2 mt-6 text-xl font-medium">Update Frequency</h3>
            <p>
              Our automated pipeline runs once daily via a scheduled cron job to
              discover new hackathons and keep listings up to date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">Contributing</h2>
            <p>
              FindHackEU is an open-source project and we welcome contributions
              from the community!
            </p>

            <h3 className="mb-2 mt-6 text-xl font-medium">How to Contribute</h3>
            <ul className="space-y-2">
              <li>
                <strong>Report Issues:</strong> Found a bug or missing
                hackathon?{" "}
                <Link
                  href="https://github.com/viganogabriele/FindHackEU/issues"
                  className="text-primary hover:underline"
                >
                  Open an issue
                </Link>
              </li>
              <li>
                <strong>Code Contributions:</strong> Fork the repository and
                submit pull requests
              </li>
              <li>
                <strong>Feature Requests:</strong> Propose new features or
                improvements
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
            <p>Need help or have questions? Here&apos;s how to get in touch:</p>

            <div className="grid grid-cols-1 gap-6 mt-6 not-prose">
              <Card className="gap-0 rounded-lg p-6 shadow-none">
                <FaGithub className="h-6 w-6 mb-3" />
                <h3 className="font-semibold mb-2">GitHub Issues</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Best for bug reports, feature requests, and technical
                  discussions
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
                  FindHackEU is maintained by Gabriele Viganò &mdash; reach
                  out for anything else
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href="mailto:info@viganogabriele.com">
                    info@viganogabriele.com
                  </Link>
                </Button>
              </Card>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              Discord, Telegram, and X (Twitter) channels are not currently
              active. They may return in the future.
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
                  Our automated pipeline scans for new hackathons once daily.
                </p>
              </div>

              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-2">
                  Can I submit a hackathon that&apos;s missing?
                </h3>
                <p className="text-sm text-muted-foreground">
                  Yes! Use the submission form in the header, next to the search
                  bar, or open an issue on our GitHub repository with the
                  hackathon details. Every submission is reviewed by a
                  maintainer before it goes live.
                </p>
              </div>

              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-2">Is the API free to use?</h3>
                <p className="text-sm text-muted-foreground">
                  Yes, our API is free for reasonable personal and small-scale
                  commercial use. We have rate limits in place to ensure fair
                  usage for everyone.
                </p>
              </div>

              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-2">
                  How do you determine if a hackathon is &quot;European&quot;?
                </h3>
                <p className="text-sm text-muted-foreground">
                  We filter events based on location data. Events must be
                  physically located in European countries or be explicitly
                  targeted at the European community.
                </p>
              </div>

              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-2">
                  Can I use this data for my own project?
                </h3>
                <p className="text-sm text-muted-foreground">
                  Yes! Our API is designed for this purpose. Please respect our
                  rate limits and consider mentioning FindHackEU as your data
                  source.
                </p>
              </div>

              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-2">
                  Who maintains FindHackEU?
                </h3>
                <p className="text-sm text-muted-foreground">
                  FindHackEU is maintained by Gabriele Viganò. It&apos;s an
                  independent, MIT-licensed project,
                  originally inspired by and born from HackTrack EU by Lorenzo
                  Palaia.
                </p>
              </div>
            </div>
          </section>

          <div className="border-t pt-6 text-center text-muted-foreground">
            <p>
              For additional questions or support, don&apos;t hesitate to reach
              out via GitHub or email. We&apos;re here to help! 🚀
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
