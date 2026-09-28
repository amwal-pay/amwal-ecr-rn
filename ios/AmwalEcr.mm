#import "AmwalEcr.h"

@interface AmwalEcrImpl : NSObject
- (void)isReachable:(NSDictionary *)request
           resolver:(RCTPromiseResolveBlock)resolve
           rejecter:(RCTPromiseRejectBlock)reject;
- (void)sale:(NSDictionary *)request
     resolver:(RCTPromiseResolveBlock)resolve
     rejecter:(RCTPromiseRejectBlock)reject;
- (void)voidTransaction:(NSDictionary *)request
                resolver:(RCTPromiseResolveBlock)resolve
                rejecter:(RCTPromiseRejectBlock)reject;
- (void)refund:(NSDictionary *)request
       resolver:(RCTPromiseResolveBlock)resolve
       rejecter:(RCTPromiseRejectBlock)reject;
- (void)inquire:(NSDictionary *)request
        resolver:(RCTPromiseResolveBlock)resolve
        rejecter:(RCTPromiseRejectBlock)reject;
- (void)inquireByReference:(NSDictionary *)request
                   resolver:(RCTPromiseResolveBlock)resolve
                   rejecter:(RCTPromiseRejectBlock)reject;
- (void)signOn:(NSDictionary *)request
       resolver:(RCTPromiseResolveBlock)resolve
       rejecter:(RCTPromiseRejectBlock)reject;
- (void)closeReceipt:(NSDictionary *)request
             resolver:(RCTPromiseResolveBlock)resolve
             rejecter:(RCTPromiseRejectBlock)reject;
- (void)receipt:(NSDictionary *)request
        resolver:(RCTPromiseResolveBlock)resolve
        rejecter:(RCTPromiseRejectBlock)reject;
- (void)cancel:(NSString *)operationId
       resolver:(RCTPromiseResolveBlock)resolve
       rejecter:(RCTPromiseRejectBlock)reject;
- (void)invalidate;
@end

@implementation AmwalEcr {
  AmwalEcrImpl *_implementation;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    _implementation = [AmwalEcrImpl new];
  }
  return self;
}

- (void)isReachable:(NSDictionary *)request
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  [_implementation isReachable:request resolver:resolve rejecter:reject];
}

- (void)sale:(NSDictionary *)request
       resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject
{
  [_implementation sale:request resolver:resolve rejecter:reject];
}

- (void)voidTransaction:(NSDictionary *)request
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  [_implementation voidTransaction:request resolver:resolve rejecter:reject];
}

- (void)refund:(NSDictionary *)request
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  [_implementation refund:request resolver:resolve rejecter:reject];
}

- (void)inquire:(NSDictionary *)request
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
  [_implementation inquire:request resolver:resolve rejecter:reject];
}

- (void)inquireByReference:(NSDictionary *)request
                     resolve:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject
{
  [_implementation inquireByReference:request resolver:resolve rejecter:reject];
}

- (void)signOn:(NSDictionary *)request
       resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject
{
  [_implementation signOn:request resolver:resolve rejecter:reject];
}

- (void)closeReceipt:(NSDictionary *)request
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  [_implementation closeReceipt:request resolver:resolve rejecter:reject];
}

- (void)receipt:(NSDictionary *)request
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
  [_implementation receipt:request resolver:resolve rejecter:reject];
}

- (void)cancel:(NSString *)operationId
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  [_implementation cancel:operationId resolver:resolve rejecter:reject];
}

- (void)invalidate
{
  [_implementation invalidate];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAmwalEcrSpecJSI>(params);
}

+ (NSString *)moduleName
{
  return @"AmwalEcr";
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
