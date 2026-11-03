require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  # CocoaPods output names are case-insensitive. Keep the wrapper product
  # distinct from the native provider's `AmwalECR` product.
  s.name         = "RNAmwalEcr"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  # AmwalECR 0.3 is an iOS 17 module. Compiling this wrapper any lower fails
  # when it imports that module.
  s.platforms    = { :ios => "17.0" }
  s.source       = { :git => "https://github.com/amwal-pay/amwal-ecr-rn.git", :tag => "v#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp}"
  s.private_header_files = "ios/**/*.h"

  # Keep this on the same native provider line as the Flutter bridge. A change
  # in how an outcome is reported is a payment-contract change, so upgrades are
  # deliberate and contract-tested before this range moves.
  s.dependency "AmwalECR", "~> 0.3.0"

  install_modules_dependencies(s)
end
