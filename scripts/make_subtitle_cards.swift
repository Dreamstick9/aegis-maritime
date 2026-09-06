import AppKit
import Foundation

guard CommandLine.arguments.count == 2 else {
    fputs("usage: make_subtitle_cards.swift OUTPUT_DIRECTORY\n", stderr)
    exit(2)
}

let outputDirectory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

let captions = [
    "Choose the cyclone forecast scenario to\nbegin the voyage demo.",
    "Run the optimizer to compare fuel, cost,\nemissions, and risk.",
    "The balanced plan lowers fuel and CO₂e,\nwith shore power at berth.",
    "Replay the voyage and watch the vessel\nfollow its planned corridor.",
    "At T+36 hours, the forecast shifts south\nand storm risk increases.",
    "A rolling re-plan generates a safer\nweather-routed corridor from the live position.",
    "Arrival confirms the final fuel, CO₂e,\nrisk, distance, and ETA.",
    "Results compares the Pareto trade-offs:\nbalanced, lowest-cost, fastest, and baseline.",
    "Fleet opens the vessel dossier, including\nhull, engine, cargo, and CII details.",
    "Routes shows the mission builder, fuel\nchoices, priorities, and search registration.",
    "Analytics explains prediction quality,\nconvergence, Pareto performance, and cost.",
    "Ports checks channel limits, vessel\ncompatibility, and operational constraints.",
    "Settings controls units, safety thresholds,\naccounting, replay, and algorithms.",
]

let size = NSSize(width: 2500, height: 260)
let textFont = NSFont.systemFont(ofSize: 34, weight: .semibold)
let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center
paragraph.lineSpacing = 5
paragraph.lineBreakMode = .byWordWrapping
let attributes: [NSAttributedString.Key: Any] = [
    .font: textFont,
    .foregroundColor: NSColor.white,
    .paragraphStyle: paragraph,
]

for (index, caption) in captions.enumerated() {
    let image = NSImage(size: size)
    image.lockFocus()

    let box = NSRect(origin: .zero, size: size)
    NSColor(calibratedWhite: 0, alpha: 0.84).setFill()
    NSBezierPath(roundedRect: box, xRadius: 28, yRadius: 28).fill()

    NSColor(calibratedRed: 0.95, green: 0.76, blue: 0.14, alpha: 1).setFill()
    NSBezierPath(rect: NSRect(x: 0, y: size.height - 6, width: size.width, height: 6)).fill()

    // Draw each deliberate line separately so AppKit cannot reflow or clip
    // long captions at the edge of the panel.
    let lines = caption.components(separatedBy: "\n")
    let lineHeight: CGFloat = 44
    let totalHeight = CGFloat(lines.count) * lineHeight
    var y = (size.height + totalHeight) / 2 - lineHeight + 2
    for line in lines {
        let attributedLine = NSAttributedString(string: line, attributes: attributes)
        let lineWidth = attributedLine.size().width
        let x = max(70, (size.width - lineWidth) / 2)
        attributedLine.draw(at: NSPoint(x: x, y: y))
        y -= lineHeight
    }
    image.unlockFocus()

    guard let tiff = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("Could not encode caption card \(index + 1)")
    }

    let destination = outputDirectory.appendingPathComponent(String(format: "caption-%02d.png", index + 1))
    try png.write(to: destination)
}
