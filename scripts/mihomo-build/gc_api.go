//go:build android && cgo

package main

/*
#include <jni.h>
#include <stdlib.h>
#include <unistd.h>
static JavaVM *gc_vm;
static jobject gc_vpn_service;
static jmethodID gc_protect_method;
static jstring newString(JNIEnv *e, const char *s) { return (*e)->NewStringUTF(e,s); }
static const char *getString(JNIEnv *e, jstring s) { return s ? (*e)->GetStringUTFChars(e,s,0) : NULL; }
static void releaseString(JNIEnv *e, jstring s,const char *v) { if(s && v) (*e)->ReleaseStringUTFChars(e,s,v); }
static void setVpnService(JNIEnv *e, jobject service) {
  if (!gc_vm) (*e)->GetJavaVM(e, &gc_vm);
  if (gc_vpn_service) (*e)->DeleteGlobalRef(e, gc_vpn_service);
  gc_vpn_service = service ? (*e)->NewGlobalRef(e, service) : NULL;
  gc_protect_method = NULL;
  if (gc_vpn_service) {
    jclass cls = (*e)->GetObjectClass(e, gc_vpn_service);
    gc_protect_method = (*e)->GetMethodID(e, cls, "protect", "(I)Z");
    (*e)->DeleteLocalRef(e, cls);
  }
}
static int hasVpnService(void) { return gc_vpn_service != NULL; }
static int protectFd(int fd) {
  if (!gc_vm || !gc_vpn_service || !gc_protect_method) return 0;
  JNIEnv *e = NULL; int attached = 0;
  if ((*gc_vm)->GetEnv(gc_vm, (void **)&e, JNI_VERSION_1_6) == JNI_EDETACHED) {
    if ((*gc_vm)->AttachCurrentThread(gc_vm, &e, NULL) != JNI_OK) return 0;
    attached = 1;
  }
  jboolean ok = (*e)->CallBooleanMethod(e, gc_vpn_service, gc_protect_method, (jint)fd);
  if ((*e)->ExceptionCheck(e)) { (*e)->ExceptionClear(e); ok = JNI_FALSE; }
  if (attached) (*gc_vm)->DetachCurrentThread(gc_vm);
  return ok == JNI_TRUE;
}
*/
import "C"
import (
	"errors"
	"fmt"
	"github.com/metacubex/mihomo/component/dialer"
	M "github.com/metacubex/mihomo/constant"
	"syscall"
	"unsafe"
)

func installSocketHook() {
	dialer.DefaultSocketHook = func(network, address string, conn syscall.RawConn) error {
		var protectErr error
		if err := conn.Control(func(fd uintptr) {
			if C.protectFd(C.int(fd)) == 0 {
				protectErr = errors.New("VpnService.protect failed")
			}
		}); err != nil {
			return err
		}
		return protectErr
	}
}
func clearSocketHook() { dialer.DefaultSocketHook = nil }
func result(e *C.JNIEnv, err error) C.jstring {
	s := ""
	if err != nil {
		s = err.Error()
	}
	return stringResult(e, s)
}
func stringResult(e *C.JNIEnv, s string) C.jstring {
	c := C.CString(s)
	defer C.free(unsafe.Pointer(c))
	return C.newString(e, c)
}

//export Java_expo_modules_xraycore_GcCore_gcSetVpnService
func Java_expo_modules_xraycore_GcCore_gcSetVpnService(e *C.JNIEnv, c C.jclass, service C.jobject) {
	C.setVpnService(e, service)
	if C.hasVpnService() != 0 {
		installSocketHook()
	} else {
		clearSocketHook()
	}
}

//export Java_expo_modules_xraycore_GcCore_gcInit
func Java_expo_modules_xraycore_GcCore_gcInit(e *C.JNIEnv, c C.jclass, s C.jstring) C.jstring {
	v := C.getString(e, s)
	defer C.releaseString(e, s, v)
	return result(e, initCore(C.GoString(v)))
}

//export Java_expo_modules_xraycore_GcCore_gcStart
func Java_expo_modules_xraycore_GcCore_gcStart(e *C.JNIEnv, c C.jclass, s C.jstring, fd C.jint) C.jstring {
	v := C.getString(e, s)
	defer C.releaseString(e, s, v)
	return result(e, startCore(C.GoString(v), int(fd)))
}

//export Java_expo_modules_xraycore_GcCore_gcStop
func Java_expo_modules_xraycore_GcCore_gcStop(e *C.JNIEnv, c C.jclass) { stopCore() }

//export Java_expo_modules_xraycore_GcCore_gcVersion
func Java_expo_modules_xraycore_GcCore_gcVersion(e *C.JNIEnv, c C.jclass) C.jstring {
	return stringResult(e, fmt.Sprintf("mihomo %s", M.Version))
}
