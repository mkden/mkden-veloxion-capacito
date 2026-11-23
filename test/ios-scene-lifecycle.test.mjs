import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("iOS SDK 27 gets a configured UIWindowScene delegate rather than a legacy UIWindow", () => {
  const plist = read("ios/App/App/Info.plist");
  const app = read("ios/App/App/AppDelegate.swift");
  const scene = read("ios/App/App/SceneDelegate.swift");
  assert.match(plist, /<key>UIApplicationSceneManifest<\/key>/);
  assert.match(plist, /<key>UISceneConfigurations<\/key>/);
  assert.match(plist, /<key>UIWindowSceneSessionRoleApplication<\/key>/);
  assert.match(plist, /<string>\$\(PRODUCT_MODULE_NAME\)\.SceneDelegate<\/string>/);
  assert.match(app, /configurationForConnecting connectingSceneSession/);
  assert.match(app, /configuration\.delegateClass = SceneDelegate\.self/);
  assert.doesNotMatch(app, /UIWindow\(frame: UIScreen\.main\.bounds\)/);
  assert.match(scene, /UIWindow\(windowScene: windowScene\)/);
  assert.match(scene, /appDelegate\.showNativeAuth\(\)/);
  assert.match(scene, /appDelegate\.window = newWindow/);
  assert.match(scene, /session\.role == \.windowApplication/);
});

test("scene lifecycle preserves Capacitor login and OAuth return links", () => {
  const scene = read("ios/App/App/SceneDelegate.swift");
  assert.match(scene, /SceneDelegateProxy\.shared\.scene\(scene, willConnectTo: session, options: connectionOptions\)/);
  assert.match(scene, /SceneDelegateProxy\.shared\.scene\(scene, openURLContexts: URLContexts\)/);
  assert.match(scene, /SceneDelegateProxy\.shared\.scene\(scene, continue: userActivity\)/);
  assert.match(scene, /func sceneDidBecomeActive/);
  assert.match(scene, /configureBridgeWebView\(\)/);
  const pkg = JSON.parse(read("package.json"));
  for (const name of ["@capacitor/core", "@capacitor/ios"]) {
    assert.ok(Number(pkg.dependencies[name].split(".")[1]) >= 5, name+" needs 8.5+");
  }
});

test("Xcode target compiles SceneDelegate rather than just placing it in a folder", () => {
  const xcode = read("ios/App/App.xcodeproj/project.pbxproj");
  const ref="A89000010000000000000017";
  const build="A89000010000000000000007";
  assert.equal(xcode.match(new RegExp(ref,"g"))?.length, 3);
  assert.equal(xcode.match(new RegExp(build,"g"))?.length, 2);
  assert.match(xcode, /SceneDelegate\.swift in Sources/);
});
