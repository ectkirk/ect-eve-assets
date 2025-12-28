import { describe, it, expect } from 'vitest'
import { escapeHtml, SUCCESS_HTML, ERROR_HTML } from './html-responses'

describe('HTML Responses', () => {
  describe('escapeHtml', () => {
    it('escapes ampersand', () => {
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar')
    })

    it('escapes less than', () => {
      expect(escapeHtml('a < b')).toBe('a &lt; b')
    })

    it('escapes greater than', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b')
    })

    it('escapes double quotes', () => {
      expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;')
    })

    it('escapes single quotes', () => {
      expect(escapeHtml("it's")).toBe('it&#39;s')
    })

    it('escapes multiple characters', () => {
      expect(escapeHtml('<script>"alert(\'xss\')"</script>')).toBe(
        '&lt;script&gt;&quot;alert(&#39;xss&#39;)&quot;&lt;/script&gt;'
      )
    })

    it('handles empty string', () => {
      expect(escapeHtml('')).toBe('')
    })

    it('leaves safe characters alone', () => {
      expect(escapeHtml('Hello World 123!')).toBe('Hello World 123!')
    })
  })

  describe('SUCCESS_HTML', () => {
    it('contains success message', () => {
      expect(SUCCESS_HTML).toContain('Login Successful')
    })

    it('contains brand name', () => {
      expect(SUCCESS_HTML).toContain('ECT')
      expect(SUCCESS_HTML).toContain('EVE Assets')
    })

    it('contains window.close script', () => {
      expect(SUCCESS_HTML).toContain('window.close()')
    })
  })

  describe('ERROR_HTML', () => {
    it('contains error message', () => {
      const html = ERROR_HTML('Something went wrong')
      expect(html).toContain('Login Failed')
      expect(html).toContain('Something went wrong')
    })

    it('escapes HTML in error message', () => {
      const html = ERROR_HTML('<script>alert("xss")</script>')
      expect(html).not.toContain('<script>alert')
      expect(html).toContain('&lt;script&gt;')
    })

    it('contains brand name', () => {
      const html = ERROR_HTML('test error')
      expect(html).toContain('ECT')
      expect(html).toContain('EVE Assets')
    })
  })
})
