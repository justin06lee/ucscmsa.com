// Foreground mask from Apple Vision: swift tmp/fgmask.swift in.jpg out.png
import Vision
import CoreImage
import Foundation
let a = CommandLine.arguments
let url = URL(fileURLWithPath: a[1])
let req = VNGenerateForegroundInstanceMaskRequest()
let h = VNImageRequestHandler(url: url)
try h.perform([req])
guard let r = req.results?.first else { print("no foreground"); exit(1) }
let buf = try r.generateScaledMaskForImage(forInstances: r.allInstances, from: h)
let ci = CIImage(cvPixelBuffer: buf)
try CIContext().writePNGRepresentation(of: ci, to: URL(fileURLWithPath: a[2]), format: .L8, colorSpace: CGColorSpace(name: CGColorSpace.linearGray)!)
print("ok", r.allInstances.count)
