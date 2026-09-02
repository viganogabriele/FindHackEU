"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { Hackathon } from "@/types/hackathon";
import { europeanCountries } from "@/lib/european-countries";
import { useTranslation } from "@/contexts/translation-context";
import { FaGoogle, FaApple, FaMicrosoft, FaYahoo } from "react-icons/fa6";

interface ExportCalendarDropdownProps {
  hackathon: Hackathon;
}

const calendarOptions = [
  { label: "Google Calendar", value: "Google" as const, icon: FaGoogle },
  { label: "Apple Calendar", value: "Apple" as const, icon: FaApple },
  { label: "Outlook", value: "Outlook.com" as const, icon: FaMicrosoft },
  { label: "iCal", value: "iCal" as const, icon: CalendarIcon },
  { label: "Yahoo", value: "Yahoo" as const, icon: FaYahoo },
  {
    label: "Microsoft Teams",
    value: "MicrosoftTeams" as const,
    icon: FaMicrosoft,
  },
  { label: "Microsoft 365", value: "Microsoft365" as const, icon: FaMicrosoft },
];

export function ExportCalendarDropdown({
  hackathon,
}: ExportCalendarDropdownProps) {
  const { t } = useTranslation();
  const formatEventForCalendar = () => {
    const startDate = new Date(hackathon.date_start);
    const endDate = hackathon.date_end
      ? new Date(hackathon.date_end)
      : startDate;

    // Check if the dates have specific times (not just 00:00:00)
    const hasStartTime =
      startDate.getUTCHours() !== 0 || startDate.getUTCMinutes() !== 0;
    const hasEndTime =
      endDate.getUTCHours() !== 0 || endDate.getUTCMinutes() !== 0;

    return {
      name: hackathon.name,
      description:
        hackathon.notes || t("export.description", { name: hackathon.name }),
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      startTime: hasStartTime
        ? startDate.toISOString().split("T")[1].substring(0, 5)
        : "09:00",
      endTime: hasEndTime
        ? endDate.toISOString().split("T")[1].substring(0, 5)
        : "18:00",
      location:
        europeanCountries.formatLocation(
          hackathon.city,
          hackathon.country_code,
        ) || undefined,
      timeZone: "Europe/London",
    };
  };

  /**
   * `add-to-calendar-button-react` is only ever needed once someone actually
   * picks a calendar, but importing it at module scope put the whole library
   * in the initial bundle - and this dropdown renders in the footer of every
   * card in the list, so it was never going to be code-split away on its
   * own. Loading it inside the handler moves it off first paint entirely.
   */
  const handleExport = async (option: (typeof calendarOptions)[number]) => {
    const { atcb_action } = await import("add-to-calendar-button-react");
    atcb_action({ ...formatEventForCalendar(), options: [option.value] });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          {t("calendar.button")}
          <CalendarIcon className="ml-1 h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--radix-dropdown-menu-trigger-width)"
        align="start"
      >
        {calendarOptions.map((option) => {
          const IconComponent = option.icon;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => void handleExport(option)}
              className="flex items-center gap-2"
            >
              <IconComponent className="h-4 w-4" />
              {t(`calendar.option.${option.value}`, { default: option.label })}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
