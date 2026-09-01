package com.amwalecr

import com.facebook.react.bridge.ReactApplicationContext

class AmwalEcrModule(reactContext: ReactApplicationContext) :
  NativeAmwalEcrSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeAmwalEcrSpec.NAME
  }
}
