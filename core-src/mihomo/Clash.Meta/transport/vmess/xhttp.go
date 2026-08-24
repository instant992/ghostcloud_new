package vmess

import (
	"context"
	"io"
	"net"
	"net/url"

	N "github.com/metacubex/mihomo/common/net"

	"github.com/metacubex/http"
)

// XhttpConfig holds configuration for the XHTTP transport.
// XHTTP uses HTTP/2 full-duplex: POST request body for upload,
// response body for download — similar to the h2 transport but
// using POST (or configurable method), a configurable path, and
// custom headers. This is equivalent to Xray-core's xhttp transport.
//
// Mode controls the streaming behavior:
//   - "stream-one", "auto", "" (default) — bidirectional HTTP/2 streaming
//   - other values — treated same as default
type XhttpConfig struct {
	Host    string
	Path    string
	Method  string // defaults to "POST"
	Mode    string // stream-one, auto, stream-up, stream-down, packet-up
	Headers map[string][]string
}

type xhttpConn struct {
	net.Conn
	*http.Http2ClientConn
	pwriter *io.PipeWriter
	res     *http.Response
	cfg     *XhttpConfig
}

func (xc *xhttpConn) establishConn() error {
	preader, pwriter := io.Pipe()

	method := xc.cfg.Method
	if method == "" {
		method = "POST"
	}
	path := xc.cfg.Path
	if path == "" {
		path = "/"
	}
	host := xc.cfg.Host

	headers := map[string][]string{
		"Accept-Encoding": {"identity"},
		"Content-Type":    {"application/octet-stream"},
	}
	for k, vs := range xc.cfg.Headers {
		headers[k] = vs
	}

	req := http.Request{
		Method: method,
		Host:   host,
		URL: &url.URL{
			Scheme: "https",
			Host:   host,
			Path:   path,
		},
		Proto:      "HTTP/2",
		ProtoMajor: 2,
		ProtoMinor: 0,
		Body:       preader,
		Header:     headers,
	}

	res, err := xc.Http2ClientConn.RoundTrip(&req)
	if err != nil {
		pwriter.Close()
		return err
	}

	xc.pwriter = pwriter
	xc.res = res
	return nil
}

// Read implements net.Conn – reads from the HTTP response body (download).
func (xc *xhttpConn) Read(b []byte) (int, error) {
	if xc.res != nil && !xc.res.Close {
		return xc.res.Body.Read(b)
	}
	if err := xc.establishConn(); err != nil {
		return 0, err
	}
	return xc.res.Body.Read(b)
}

// Write implements net.Conn – writes to the HTTP request body (upload).
func (xc *xhttpConn) Write(b []byte) (int, error) {
	if xc.pwriter != nil {
		return xc.pwriter.Write(b)
	}
	if err := xc.establishConn(); err != nil {
		return 0, err
	}
	return xc.pwriter.Write(b)
}

// Close shuts down the XHTTP connection.
func (xc *xhttpConn) Close() error {
	if xc.pwriter != nil {
		_ = xc.pwriter.Close()
	}
	ctx := context.Background()
	if xc.res != nil {
		ctx = xc.res.Request.Context()
	}
	_ = xc.Http2ClientConn.Shutdown(ctx)
	return xc.Conn.Close()
}

// StreamXhttpConn wraps an existing TLS-upgraded net.Conn with the XHTTP
// HTTP/2 transport. The connection must already have TLS with "h2" ALPN.
func StreamXhttpConn(ctx context.Context, conn net.Conn, cfg *XhttpConfig) (_ net.Conn, err error) {
	if ctx.Done() != nil {
		done := N.SetupContextForConn(ctx, conn)
		defer done(&err)
	}

	transport := &http.Http2Transport{}
	cconn, err := transport.NewClientConn(conn)
	if err != nil {
		return nil, err
	}

	return &xhttpConn{
		Conn:            conn,
		Http2ClientConn: cconn,
		cfg:             cfg,
	}, nil
}
