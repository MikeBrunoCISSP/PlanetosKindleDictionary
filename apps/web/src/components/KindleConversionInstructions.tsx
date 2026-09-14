import type { ReactNode } from "react";

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-bold mt-8 mb-3">{children}</h2>;
}

function StepHeading({ children }: { children: ReactNode }) {
  return <h3 className="font-semibold mt-6 mb-1.5">{children}</h3>;
}

export function KindleConversionInstructions() {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <SectionHeading>A Note for Kindle Users</SectionHeading>
      <p>
        The dictionary files downloaded from this page will need to be converted to <code>.mobi</code> format before
        being loaded onto your device. The following video by{" "}
        <ExternalLink href="https://www.youtube.com/@ArthurBrs777">Arthur Brs</ExternalLink> provides instructions.
      </p>

      <a
        href="https://www.youtube.com/watch?v=b7xAchBBNjo"
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block aspect-video w-full max-w-xl overflow-hidden rounded-md border"
      >
        <img
          src="https://img.youtube.com/vi/b7xAchBBNjo/maxresdefault.jpg"
          alt="How to Add Custom Dictionaries to Kindle (Windows & Mac) 2026 Tutorial, by Arthur Brs"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-black/10 transition-colors group-hover:bg-black/20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-20 items-center justify-center rounded-xl bg-red-600 shadow-lg transition-transform group-hover:scale-105">
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-white">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-red-600">
            <path d="M21.6 7.2s-.2-1.5-.8-2.2c-.8-.8-1.7-.8-2.1-.9C15.9 4 12 4 12 4h0s-3.9 0-6.7.1c-.4.1-1.3.1-2.1.9-.6.7-.8 2.2-.8 2.2S2.2 9 2.2 10.7v1.6C2.2 14 2.4 15.8 2.4 15.8s.2 1.5.8 2.2c.8.9 1.9.9 2.3 1 1.7.2 7.1.2 7.1.2s3.9 0 6.7-.1c.4-.1 1.3-.1 2.1-.9.6-.7.8-2.2.8-2.2s.2-1.8.2-3.5v-1.6c0-1.7-.2-3.5-.2-3.5zM9.9 14.6V8.9l5.4 2.9-5.4 2.8z" />
          </svg>
          <span className="text-xs font-medium">Watch on YouTube</span>
        </div>
      </a>

      <SectionHeading>Detailed Instructions</SectionHeading>

      <StepHeading>1. Download and install Kindle Previewer</StepHeading>
      <p>
        Visit Amazon's{" "}
        <ExternalLink href="https://www.amazon.com/Kindle-Previewer/b?ie=UTF8&node=21381691011">
          Kindle Previewer download page
        </ExternalLink>{" "}
        and download the version for your computer.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong>Windows:</strong> Run the downloaded installer and follow its prompts. Open Kindle Previewer from
          the Start menu.
        </li>
        <li>
          <strong>Mac:</strong> Open the downloaded installer and follow its prompts, then launch Kindle Previewer
          from Applications.
        </li>
      </ul>
      <p>
        Use the latest supported release. Amazon currently lists Windows 10 (64-bit) or later and macOS 12 or later
        as requirements. See{" "}
        <ExternalLink href="https://kdp.amazon.com/en_US/help/topic/G202131170">Amazon's Previewer help</ExternalLink>{" "}
        for current compatibility.
      </p>
      <p className="text-muted-foreground">
        This guide assumes you already have an EPUB prepared specifically as a Kindle-compatible dictionary,
        including its lookup index and language metadata. An ordinary EPUB containing definitions is not enough.
        These instructions are for a physical Kindle e-reader.
      </p>

      <StepHeading>2. Convert the EPUB to a .mobi file</StepHeading>
      <p>The conversion steps are the same on Windows and Mac:</p>
      <ol className="list-decimal pl-5 space-y-1">
        <li>Open Kindle Previewer.</li>
        <li>
          Choose <strong>File &gt; Open Book</strong> (or <strong>Open Book</strong> on the opening screen) and
          select your dictionary's <code>.epub</code> file.
        </li>
        <li>Wait for conversion to finish. Larger dictionaries may take longer.</li>
        <li>
          Choose <strong>File &gt; Export</strong>.
        </li>
        <li>
          Select <strong>Books (.mobi) — to sideload on older Kindle devices</strong>, or the equivalent MOBI export
          option in your version.
        </li>
        <li>
          Choose a destination on your computer, such as Downloads, and save the file. For example:{" "}
          <code>MyCustomDictionary.mobi</code>.
        </li>
        <li>Wait for the export-success confirmation.</li>
      </ol>
      <p>
        Amazon documents this EPUB-to-MOBI workflow in{" "}
        <ExternalLink href="https://kdp.amazon.com/en_US/help/topic/G200641240">
          Upload and Preview Book Content
        </ExternalLink>
        . The export label mentions older devices; MOBI is also the format used for this dictionary installation
        workflow. Do not merely rename <code>.epub</code> to <code>.mobi</code>, and do not copy a <code>.kpf</code>{" "}
        preview file to the Kindle.
      </p>
      <p>
        If export is unavailable, make sure you opened the original EPUB, rather than a KPF file. Some languages
        cannot be exported to MOBI; see the{" "}
        <ExternalLink href="https://kindlepreviewer3.s3.amazonaws.com/UserGuide320_EN.pdf">
          Previewer User Guide
        </ExternalLink>
        .
      </p>

      <StepHeading>3. Copy the dictionary to your Kindle over USB</StepHeading>
      <p>
        Use a USB cable that supports data transfer. For this workflow, copy the exported MOBI directly over USB; do
        not email it or upload it through wireless Send to Kindle.
      </p>

      <p className="font-semibold mt-4 mb-1">Windows</p>
      <ol className="list-decimal pl-5 space-y-1">
        <li>Connect and unlock your Kindle. Allow file access if prompted.</li>
        <li>
          Open <strong>File Explorer &gt; This PC &gt; Kindle</strong>. Open Internal Storage if shown.
        </li>
        <li>
          Open <code>documents</code> and copy <code>MyCustomDictionary.mobi</code> into it.
        </li>
      </ol>

      <p className="font-semibold mt-4 mb-1">Mac: Kindle visible in Finder</p>
      <ol className="list-decimal pl-5 space-y-1">
        <li>Connect and unlock your Kindle.</li>
        <li>
          Open Finder, select Kindle under Locations, and open <code>documents</code>.
        </li>
        <li>
          Copy <code>MyCustomDictionary.mobi</code> into that folder.
        </li>
      </ol>

      <p className="font-semibold mt-4 mb-1">Mac: Kindle Scribe or a newer model not visible in Finder</p>
      <p>Amazon specifies an additional transfer app for Scribe and 2024 models:</p>
      <ol className="list-decimal pl-5 space-y-1">
        <li>
          Install Amazon's <ExternalLink href="https://www.amazon.com/sendtokindle/mac">Send to Kindle for Mac</ExternalLink>.
        </li>
        <li>Connect your Kindle and open the app.</li>
        <li>
          Select <strong>Tools &gt; USB File Manager</strong>.
        </li>
        <li>
          Drag the MOBI from Finder into the Kindle's Documents folder in that window. Use the USB file manager,
          rather than the wireless sending interface.
        </li>
      </ol>

      <p>
        Wait for copying to finish. Eject the Kindle if your computer offers that option; otherwise use Disconnect on
        the Kindle if available, then unplug.
      </p>
      <p>
        See Amazon's{" "}
        <ExternalLink href="https://digprjsurvey.amazon.com/csad/help/node/TCUBEdEkbIhK07ysFu">
          USB transfer instructions for Windows and Mac
        </ExternalLink>
        .
      </p>
      <p>
        Amazon's dictionary-testing instructions use the Documents folder directly. If your Kindle already has a{" "}
        <code>documents/dictionaries</code> subfolder, you can use that to keep the dictionary organized. Keep the
        original EPUB and exported MOBI on your computer for future reinstalls.
      </p>

      <StepHeading>4. Select your custom dictionary</StepHeading>
      <ol className="list-decimal pl-5 space-y-1">
        <li>
          On the Kindle, open <strong>Settings &gt; All Settings</strong>, if shown.
        </li>
        <li>
          Find <strong>Language &amp; Dictionaries &gt; Dictionaries</strong>. On some versions, this is under{" "}
          <strong>Device Options</strong>.
        </li>
        <li>Select the language of the words you will look up, such as English.</li>
        <li>
          Select your custom dictionary and tap <strong>OK</strong> if prompted.
        </li>
      </ol>
      <p>The setting applies per language. The dictionary's displayed title may differ from its filename.</p>

      <StepHeading>5. Look up a word while reading</StepHeading>
      <p>
        Open a book in the matching language and <strong>press and hold a word</strong> included in your custom
        dictionary. Its definition should appear in the lookup popup. Where supported, tap the dictionary name to
        switch dictionaries. Repeat step 4 to restore your usual default later.
      </p>

      <p className="font-semibold mt-4 mb-1">X-Ray may appear first</p>
      <p>
        <strong>If the selected word is an X-Ray topic, Kindle may show X-Ray before your custom dictionary.</strong>{" "}
        This does not mean the dictionary failed to install. Swipe sideways through the popup cards, or tap the right
        arrow, if shown, to reach the Dictionary result. The exact controls vary by firmware. There is no documented
        setting to always prioritize Dictionary over X-Ray.
      </p>
      <p>
        These selection and lookup behaviors are described in the{" "}
        <ExternalLink href="https://d1ergij2b6wmg5.cloudfront.net/kug/kindle_paperwhite_12th/v1/en-US/html/kug.html">
          Kindle User's Guide
        </ExternalLink>
        .
      </p>

      <SectionHeading>Troubleshooting</SectionHeading>
      <ul className="list-disc pl-5 space-y-2">
        <li>
          <strong>The dictionary is missing from settings:</strong> Confirm that the exported MOBI is in the Kindle's
          documents folder, disconnect, allow time for it to appear, and restart the Kindle if necessary. Check the
          appropriate language in dictionary settings.
        </li>
        <li>
          <strong>It opens as a book but cannot be selected as a dictionary:</strong> The file may be missing the
          required dictionary metadata or index. Conversion alone does not create those. Ask the EPUB's provider to
          check the source against Amazon's dictionary requirements.
        </li>
        <li>
          <strong>One word has no definition:</strong> Test a headword you know is included. A dictionary may not
          contain every plural, inflection, name, or phrase.
        </li>
      </ul>
    </div>
  );
}
