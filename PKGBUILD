pkgname=tema-git
pkgver=r1.0
pkgrel=1
pkgdesc="A simple theme switcher (my custom version)"
arch=('x86_64')
url="https://github.com/bdgcypher/tema"
license=('MIT')
depends=('glibc')
makedepends=('go' 'git')
provides=('tema')
conflicts=('tema')
source=("tema::git+file://$PWD")
md5sums=('SKIP')

build() {
  cd "$srcdir/tema"
  go build -o tema
}

package() {
  cd "$srcdir/tema"
  install -Dm755 tema "$pkgdir/usr/bin/tema"
}
